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
  console.log(data);
  const md = markdown();

  // Send message to all connected WebSocket clients
  clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(md.render(data)));
      }
  });
}

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


//===========================================================================================

let dep_obj = {};
let dep_count = -1;

async function getDependency(package_name, package_version){
  dep_count++;
  sendDataToFront(`curr pkg: ${package_name} ${package_version}`);
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
      sendDataToFront(`dependencies ${JSON.stringify(dependencies)}`);
      dep_obj = {...dep_obj, ...dependencies}
    }
    else{
      sendDataToFront(`No dependencies`);
    }
  }
  catch(err){
    sendDataToFront(err);
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

  // console.log("dep_obj: ", dep_obj);

  sendDataToFront(`Total dependencies: ${dep_count}`);
  
  makeJSON(pkg_to_test);
}

  
function handleFileLoad(data) {
  let dependencies = JSON.parse(data).dependencies;
  dependencies = Object.entries(dependencies);
          
  dependencies = dependencies.filter((dep_ver_pair) => dep_ver_pair[0].charAt(0) !== '@');
  dependencies.map((dependency) => findVulnerabilites(dependency));
}
