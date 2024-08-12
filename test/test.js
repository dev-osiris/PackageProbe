async function getDependency(package_name, package_version) {
  sendDataToFront({type: "normal", message: `current package: ${package_name}@${package_version}`});
  let dependencies;

  try {
      const response = await fetch(`https://registry.npmjs.org/${package_name}/${package_version}`, {method: "GET"});
      const data = await response.json();

      // Add current package to dep_obj:
      dep_obj[data.name] = data.version;

      dependencies = data.dependencies; //TODO: LOOK FOR DEVDEPENDENCIES
      if (dependencies === undefined || isObjectEmpty(dependencies)) {
          sendDataToFront({type: "normal", message: `${package_name}: no dependencies`});
      } else {
          sendDataToFront({type: "normal", message: `${package_name} dependencies: ${JSON.stringify(dependencies)}`});
          dep_obj = {...dep_obj, ...dependencies};
      }
  } catch (err) {
      sendDataToFront({type: "error", message: `${err}`});
  }
  return dependencies;
}

async function DFS(dependency, vis) {
  let stack = [dependency];

  // DFS of dependency tree
  while (stack.length > 0) {
      const curr_dependency = stack.pop();

      if (!curr_dependency) {
          continue;
      }
      for (let pkg in curr_dependency) {
          if (vis.has(pkg)) continue;
          else vis.add(pkg);

          dep_count = Math.max(dep_count, vis.size);
          const sub_dependencies = await getDependency(pkg, curr_dependency[pkg]);
          if (sub_dependencies) {
              stack.push(sub_dependencies);
          }
      }
  }
}


async function findVulnerabilites(pkg_to_test, callback) {
  const package_name = pkg_to_test[0];
  let package_version = pkg_to_test[1];

  // Remove ^ and ~ if they exist from the package version
  if (package_version[0] === '^' || package_version[0] === '~') {
      package_version = package_version.slice(1);
  }

  const dependency = await getDependency(package_name, package_version);
  const vis = new Set(); // Assuming vis is a Set to keep track of visited dependencies

  // Wait for DFS to complete all URL fetching
  await DFS(dependency, vis);

  // Proceed after all URL fetching is done
  callback(dep_obj);
}

// Example usage
const dependencies = [['example-package', '^1.0.0']];

// Assuming sendDataToFront and other functions are defined
findVulnerabilites(dependencies[0], (result) => {
  console.log('Dependencies processed:', result);
});
