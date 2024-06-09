const fs = require("fs");
const path = require('path');
console.log(__dirname)
fs.unlink(path.join(__dirname, 'JSON', 'package.json') ,(err) => {
    if(err) console.log("Error in deleting package.json: ", err);
    else console.log("Deleted package.json");
  });
//   fs.unlink(path.join(__dirname, 'JSON', 'package-lock.json'), (err) => {
//     if(err) console.log("Error in deleting package-lock.json: ", err);
//     else console.log("Deleted package-lock.json");
//   });