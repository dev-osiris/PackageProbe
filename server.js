const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const formidable = require('formidable');
const fsExtra = require('fs-extra');
const fs = require("fs");
const markdown = require('markdown-it');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

app.use(express.static(path.join(__dirname, 'public')));

// const { createServer } = require('http');
// const server = createServer(app);
// const wss = new WebSocket.Server({ server });

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


        // Read uploaded file
        fs.readFile(filePath, 'utf-8', (err, data) => {
          if (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Error reading the uploaded file');
              return;
          }

          handleFileLoad(data);
        });
    });
});    


// Download route to send data as a .txt file
app.get('/download', (req, res) => {
  const filePath = path.join(__dirname, 'report.txt');

  // Write the uploaded data to a file
  fs.writeFile(filePath, reportData, err => {
    if (err) {
      console.error('Error writing file:', err);
      res.status(500).send('Server Error');
      return;
    }

    // Send the file to the client
    res.download(filePath, 'report.txt', err => {
      if (err) {
        console.error('Error sending file:', err);
      }

      // Optionally, delete the file after sending it
      fs.unlink(filePath, err => {
        if (err) {
          console.error('Error deleting file:', err);
        }
      });
    });
  });
});


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


//===========================================================================================

let dep_obj = {};
let dep_count = 0;
let reportData = "no data currently";

async function getDependency(package_name, package_version){
  dep_count++;
  sendDataToFront({type: "normal", message: `curr package: ${package_name}@${package_version}`});
  let dependencies;

  try{
    const response = await fetch(`https://registry.npmjs.org/${package_name}/${package_version}`, {method: "GET"});
    const data = await response.json();

    // add the curr package name and ver in the dep_obj if it is empty
    if(Object.keys(dep_obj).length === 0){
      dep_obj[data.name] = data.version;
    }

    dependencies = data.dependencies; //TODO: LOOK FOR DEVDEPENDENCIES
    if(dependencies){
      sendDataToFront({type: "normal", message: `dependencies: ${JSON.stringify(dependencies)}`});
      dep_obj = {...dep_obj, ...dependencies}
    }
    else{
      sendDataToFront({type: "normal", message: `No dependencies`});
    }
  }
  catch(err){
    sendDataToFront({type: "error", message: `${err}`});
  }
  return dependencies;
}

async function DFS(dependency, vis){
  let stack = [dependency];
  
  // DFS of dependency tree
  while(stack.length > 0){
    const curr_dependency = stack.pop();

    if(!curr_dependency){
      continue;
    }
    for(let pkg in curr_dependency){
      if(vis.has(pkg)) continue;
      else vis.add(pkg);

      stack.push(await getDependency(pkg, curr_dependency[pkg]));
    }
  }
}

// builds package.json and package-lock.json
async function makeJSON(latest_dep_object){
  const execSync = require('child_process').exec; //executing shell commands

  // skeleton data for package.json file
  // let boilerPlateData = `{"dependencies": ${JSON.stringify(latest_dep_object)} }`
  let boilerPlateData = '{{"d": "5" }}';
  console.log("boilerplate: ", boilerPlateData);

  execSync(`cd JSON && echo ${boilerPlateData} > package.json`, {encoding: 'utf-8'}, (err) => {
    if (err) throw err;
  
    // generate package-lock.json so that npm audit can be run
    execSync('cd JSON && npm i --package-lock-only', { encoding: 'utf-8' }, (err) => {
        if(err) throw err;

      // do audit
      execSync("cd JSON && npm audit --package-lock-only", { encoding: 'utf-8' }, (_1, audit_report, _2) => {
        
        sendDataToFront({type: "result", message: `${audit_report}`});


        // create dependency tree, -package-lock-only flag ensures dependencies are fetched from 
        // package-lock.json and not from node_modules folder
        execSync("cd JSON && npm ls --all --package-lock-only", { encoding: 'utf-8' }, (err, tree) => {

          if(err) throw err;
          reportData =  `Total Dependencies: ${dep_count} \n\n` +
                        `Dependency tree: \n ${tree} \n` +
                        `Report: \n${audit_report}`;
  
          // deleteJSON();
          dep_obj = {};
          dep_count = 0;
          audit_report = "";
        });
      }); 
    }); 
  });
}

function objectToPlainText(obj) {
  let plainText = '';
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      plainText += `${key}@${obj[key]}\n`;
    }
  }
  return plainText;
}

async function findVulnerabilites(pkg_to_test, callback){
  const package_name = pkg_to_test[0];
  let package_version = pkg_to_test[1];

  // remove ^ and ~ if it exists from package version
  if(package_version[0] === '^' || package_version[0] === '~'){
    package_version = package_version.slice(1);
  }

  const dependency = await getDependency(package_name, package_version);
  let vis = new Set(package_name); //visit set to avoid visiting duplicate dependencies
  
  DFS(dependency, vis);

  
  sendDataToFront({type: "normal", message: `Total dependencies: ${dep_count}`});
  console.log("dep_obj: ", dep_obj);
  callback(dep_obj);
}

  
async function handleFileLoad(data) {

  let dependencies = JSON.parse(data).dependencies;

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
    console.log("results", results);
    makeJSON(results.at(-1));
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