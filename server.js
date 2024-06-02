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


function sendDataToFront(data){
    const md = markdown();
    // Send message to all connected WebSocket clients
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            // console.log("DATA: ", data);
            client.send(JSON.stringify(md.render(data)));
        }
    });
}

app.use(express.static(path.join(__dirname, 'public')));


// Serve static files from the 'views' directory
// Default route
app.get('/', (req, res) => {
    // res.sendFile(path.join(__dirname, 'views', 'index.html'));

    fs.readFile(path.join(__dirname, 'public', 'views', 'index.html'), 'utf-8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.write(data);
          res.end();
          console.log("index.html rendered");
        }
    });
});

// Upload route
app.post('/upload', (req, res) => {
    const form = new formidable.IncomingForm();
          
    fsExtra.emptyDirSync('./uploads');
    // require("fs/promises").rm('./uploads', {recursive: true}); //empty uploads folder first
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

            // Print file data
            // console.log('File Data:', data);
            handleFileLoad(data);

            // Send file data back to frontend
            // res.writeHead(200, { 'Content-Type': 'application/json' });
            // res.end(JSON.stringify({ fileData: data }));
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
    console.log('Server is running at http://localhost:3000');
});


//======================================================================================


let dep_obj = {};
let dep_count = -1;

// return the details of the latest version of package
function getLatestVer(data){
  const versions = Object.keys(data.versions);
  for(let i = versions.length - 1, count = 0; i >= 0 && count < 50; i--, count++){
    // shows only the versions with format NN.NN.NN where N is a number
    if(versions[i].length <= 10){ 
      const curr_ver = versions[i];

      // returns the latest stable version as on object
      return data.versions[curr_ver];
    }
  }
}

async function getDependency(package_name, package_version){
  dep_count++;
  console.log("Curr pkg: ", package_name, package_version);
  sendDataToFront(`curr pkg: ${package_name} ${package_version}`);
  let dependencies;

  try{
    const response = await fetch(`https://registry.npmjs.org/${package_name}/${package_version}`, {method: "GET"});
    const data = await response.json();
    // const latestVerData = getLatestVer(data);

    // add the curr package name and ver in the dep_obj if it is empty
    if(Object.keys(dep_obj).length === 0){
      dep_obj[data.name] = data.version;
    }

    dependencies = data.dependencies; //TODO: LOOK FOR DEVDEPENDENCIES
    if(dependencies){
      console.log(package_name, " dependencies: ", dependencies);
      sendDataToFront(`dependencies ${JSON.stringify(dependencies)}`);
      dep_obj = {...dep_obj, ...dependencies}
    }
    else{
      console.log("No dependencies");
      sendDataToFront(`No dependencies`);
    }
  }
  catch(err){
    console.log(err);
    sendDataToFront(err);
  }
  return dependencies;
}

async function DFS(dependency, vis){
  let stack = [dependency];
  
  // DFS of dependency tree
  while(stack.length > 0){
    const curr_dependency = stack.pop();
    // console.log("curr dep: ", curr_dependency);
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
async function makeJSON(pkg){
  const execSync = require('child_process').exec; //executing shell commands

  // skeleton data for package.json file
  let boilerPlateData = `{"dependencies": ${JSON.stringify(dep_obj)} }`

  execSync(`cd JSON && echo ${boilerPlateData} > package.json`, {encoding: 'utf-8'}, (err) => {
    if (err) throw err;
  
    // generate package-lock.json so that npm audit can be run
    execSync('cd JSON && npm i --package-lock-only', { encoding: 'utf-8' }, (err) => {
        if(err) throw err;

      // do audit
      execSync("cd JSON && npm audit", { encoding: 'utf-8' }, (_1, audit_report, _2) => {
        // if(_1) throw _1;
        console.log(pkg, ": ");
        console.log(audit_report);

        sendDataToFront(`${JSON.stringify(pkg)}: `);
        sendDataToFront(`${audit_report}`);
      }); 
    }); 
  });
}

async function findVulnerabilites(pkg_to_test){

  const package_name = pkg_to_test[0];
  let package_version = pkg_to_test[1];

  // remove ^ if it exists from package version
  if(package_version[0] === '^'){
    package_version = package_version.slice(1);
  }

  const dependency = await getDependency(package_name, package_version);
  let vis = new Set(package_name); //visit set to avoid visiting duplicate dependencies
  
  DFS(dependency, vis);

  console.log("total dependencies: ", dep_count);
  console.log("dep_obj: ", dep_obj);

  sendDataToFront(`Total dependencies ${dep_count}`);
  
  makeJSON(pkg_to_test);
}

  
function handleFileLoad(data) {
  let dependencies = JSON.parse(data).dependencies;
  dependencies = Object.entries(dependencies);
  
  //   Object.keys(dependencies).forEach((dependency) => {
      //     if(dependency.charAt(0) != "@"){
          //       findVulnerabilites(dependency);
          //     }
          //   });
          
    dependencies = dependencies.filter((dep_ver_pair) => dep_ver_pair[0].charAt(0) !== '@');
    console.log(dependencies);
    dependencies.map((dependency) => findVulnerabilites(dependency));
}
