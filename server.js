const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const formidable = require('formidable');
const fsExtra = require('fs-extra');
const fs = require("fs");
const markdown = require('markdown-it');
const cheerio = require('cheerio');
const { type } = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

app.use(express.static(path.join(__dirname, 'public')));

// Serve static files from the 'views' directory
// Default route
app.get('/', (req, res) => {
    fs.readFile(path.join(__dirname, 'public', 'views', 'index.html'), 'utf-8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.write(data);
          res.end();
        }
    });
});

// Upload route
app.post('/upload', (req, res) => {
    const form = new formidable.IncomingForm();
          
    fsExtra.emptyDirSync('./uploads');
    form.uploadDir = path.join(__dirname, 'uploads');
    form.keepExtensions = true;
    
    
    form.parse(req, (err, fields, files) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
            return;
        }

        const filePath = files.file[0].filepath;
        fileName = files.file[0].originalFilename;
        

        // Read uploaded file
        fs.readFile(filePath, 'utf-8', (err, data) => {
          if (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Error reading the uploaded file');
              return;
          }
          //data is the full package.json file the user uploads
          handleFileLoad(data);
        });
    });
});    


// Download route to send data as a .html file
app.get('/download', (req, res) => {
  const filePath = path.join(__dirname, 'report.html');

  // Send the file to the client
  res.download(filePath, 'report.html', err => {
    if (err) {
      console.error('Error sending report.html for download:', err);
    }

    // Delete the report file after sending it
    // fs.unlink(filePath, err => {
    //   if (err) {
    //     console.error('Error deleting report.html file:', err);
    //   }
    // });
  });
});

// non existent routes
app.use((req, res, next) => {
  fs.readFile(path.join(__dirname, 'public', 'views', 'PageNotFound.html'), 'utf-8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write(data);
        res.end();
      }
  });
})


// WebSocket connection
wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.push(ws); // push any new connection to clients[]

    ws.on('close', () => {
      console.log('Client disconnected');

      // This ensures that the clients array only contains active WebSocket connections.
      clients = clients.filter(client => client !== ws);
    });
});

server.listen(3000, () => { 
  console.log(`Server is running at port 3000`);
});


function sendDataToFront(data){
  // console.log(data.message);
  const md = markdown();

  // Send message to all connected WebSocket clients
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
        const md_message = md.render(data.message);
        client.send(JSON.stringify({type: data.type, message: md_message}));
    }
  });
}


//========================================================================================================

let dep_obj = {};
let dep_count = 0;
let vis = new Set([]); //visit set to avoid visiting duplicate dependencies
let fileName; //name of the json file user will upload

function isObjectEmpty(object){
  if(Object.keys(object).length === 0){
    return true;
  }
  return false;
}

async function getDependency(package_name, package_version){
  sendDataToFront({type: "normal", message: "\\>> " + `current package: ${package_name}@${package_version}`});
  let dependencies;

  try{
    const response = await fetch(`https://registry.npmjs.org/${package_name}/${package_version}`, {method: "GET"});
    const data = await response.json();

    // Add current package to dep_obj:
    dep_obj[data.name] = data.version;

    dependencies = data.dependencies; //TODO: LOOK FOR DEVDEPENDENCIES
    if(dependencies === undefined || isObjectEmpty(dependencies)){
      sendDataToFront({type: "normal", message: "\\>> " + `${package_name}: no dependencies`});
    }
    else{
      sendDataToFront({type: "normal", message: "\\>> " + `${package_name} dependencies: ${JSON.stringify(dependencies)}`});
      dep_obj = {...dep_obj, ...dependencies}
    }
  }
  catch(err){
    sendDataToFront({type: "error", message: "\\>> " + `${err}`});
  }
  console.log("return from getDependencies(): ", dependencies);
  return dependencies; //dependencies is an object of {"package name": "version"}
}


async function DFS(dependency, vis){
  let stack = [dependency]; //dependency is an object of format {"package name": "version"}
  
  // DFS of dependency tree
  while(stack.length > 0){
    const curr_dependency = stack.pop();

    if(!curr_dependency){
      continue;
    }
    for(let pkg in curr_dependency){ //iterating of all package names
      if(vis.has(pkg)) continue;
      else vis.add(pkg);

      dep_count = Math.max(dep_count, vis.size);
      //                             getDependency(pkg-name, pkg-version) => returns an object
      const sub_dependencies = await getDependency(pkg, curr_dependency[pkg]); 
      if (sub_dependencies) {
        stack.push(sub_dependencies);
      }
    }
  }
}

// This date is added to the generated report
function getFormattedDate(){
  const now = new Date();
    
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC +5:30
  const istTime = new Date(now.getTime() + istOffset);

  const day = String(istTime.getUTCDate()).padStart(2, '0');
  const month = String(istTime.getUTCMonth() + 1).padStart(2, '0'); // Months are zero-based
  const year = istTime.getUTCFullYear();
  
  const hours = String(istTime.getUTCHours()).padStart(2, '0');
  const minutes = String(istTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istTime.getUTCSeconds()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

async function addDataToReport(dep_count, tree, audit_report){
  // Path to the report.html file
  const ReportfilePath = './report.html';

  // Read the existing HTML file
  fs.readFile(ReportfilePath, 'utf8', (err, reportTemplateData) => {
      if (err) {
          console.error('Error reading file:', err);
          return;
      }

      // Load the HTML into Cheerio
      const $ = cheerio.load(reportTemplateData);

      $('#date').html(getFormattedDate());

      //Modify the Total dependencies span tag
      $('#total_dependencies_num').html(dep_count);

      //Add the actual filename of the json file to the report
      $('#fileName').html(fileName);

      //Modify the tree
      $('#tree_pre').html(tree);

      //Modify the audit report
      $('#report_pre').html(audit_report);

      // Write the updated HTML back to the file
      fs.writeFile(ReportfilePath, $.html(), (err) => {
          if (err) {
              console.error('Error writing file:', err);
          } else {
              console.log('Report updated successfully.');
          }
      });
  });
}

// builds package.json and package-lock.json
async function makeJSON(latest_dep_object){
  const execSync = require('child_process').exec; //executing shell commands

  // skeleton data for package.json file
  let boilerPlateData = `{"dependencies": ${JSON.stringify(latest_dep_object)} }`
  console.log("boilerplatedata: ", boilerPlateData);
  
  // make package.json file
  fs.writeFile(path.join(__dirname, "JSON", "package.json"), boilerPlateData, err => {
    if (err) {
      console.error('Error writing file:', err);
      res.status(500).send('Server Error');
      return;
    }
    // generate package-lock.json so that npm audit can be run
    execSync('cd JSON && npm i --package-lock-only', { encoding: 'utf-8' }, (err) => {
        if(err) throw err;

      // do audit
      execSync("cd JSON && npm audit --package-lock-only", { encoding: 'utf-8' }, (_1, audit_report, _2) => {
        
        // create dependency tree, -package-lock-only flag ensures dependencies are fetched from 
        // package-lock.json and not from node_modules folder
        execSync("cd JSON && npm ls --all --package-lock-only", { encoding: 'utf-8' }, (err, tree) => {
          
          if(err) throw err;

          addDataToReport(dep_count, tree, audit_report);
          
          deleteJSON();
          sendDataToFront({type: "result", message: `${audit_report}`});
          sendDataToFront({type: "break", message: ''});
          sendDataToFront({type: "result", message: `TOTAL DEPENDENCIES: ${dep_count}`});
          sendDataToFront({type: "break", message: ''});
          sendDataToFront({type: "result", message: `You can download the generated report now.`});
          dep_obj = {};
          dep_count = 0;
          console.log("VIS SIZE: ", vis.size);
          vis.clear();
          audit_report = "";
        });
      }); 
    }); 
  });
}


async function findVulnerabilites(pkg_to_test, callback){
  const package_name = pkg_to_test[0];
  let package_version = pkg_to_test[1];

  // remove ^ and ~ if it exists from package version
  if(package_version[0] === '^' || package_version[0] === '~'){ //TODO: some versions have = < > signs, have to tackle them
    package_version = package_version.slice(1);
  }

  const dependency = await getDependency(package_name, package_version);
  
  await DFS(dependency, vis);
  
  callback(dep_obj);
}

  
async function handleFileLoad(data) { //data is the full package.json file user uploads

  let dependencies = JSON.parse(data).dependencies; //extract only the dependency part

  // check if package.json doesn't contain any dependencies
  if(dependencies === undefined){
    sendDataToFront({
      type: "alert", 
      message: "No dependencies found in file. File may be misconfigured, empty or corrupt."
    });
    return;
  }

  
  dependencies = Object.entries(dependencies);
  
  dependencies = dependencies.filter((dep_ver_pair) => dep_ver_pair[0].charAt(0) !== '@');
  console.log("after filter: ", dependencies)

  dep_count = dependencies.length; //initial value of dependency count

  // add initial dependencies in vis
  // This also makes sure that dep_count is calculated correctly
  for(let i = 0; i < dependencies.length; i++){
    vis.add(dependencies[i][0]);
  }

  await processDependencies(dependencies);
}

const processDependencies = async (dependencies) =>  {
  // We use map to create an array of Promises, wrapping the async operation.
  // using promise here is imp as it is necessary for Promise.all() to work.
  const promises = dependencies.map(dependency => {
    return new Promise((resolve, reject) => {
      findVulnerabilites(dependency, result => { resolve(result) });
    });
  });
  
  try{
    // Use Promise.all() to wait for all async operations to complete,
    // ensuring we have all results before proceeding.
    const results = await Promise.all(promises);
    await makeJSON(results.at(-1));
  }
  catch(err){
    console.log(err);
  }
}


function deleteJSON(){
  // delete old data
  fs.unlink(path.join(__dirname, 'JSON', 'package.json'), (err) => {
    if(err) console.log("Error in deleting package.json: ", err);
    else console.log("Deleted package.json");
  });
  fs.unlink(path.join(__dirname, 'JSON', 'package-lock.json'), (err) => {
    if(err) console.log("Error in deleting package-lock.json: ", err);
    else console.log("Deleted package-lock.json");
  });
}