let fs = require("fs");

function scrape(URL){
    fetch(URL)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.text();
    })
    .then(html => {
        fs.writeFile("./test/scrape.html", html, () => {});
    //   console.log(html); // HTML content of the page
    })
    .catch(error => {
      console.error('Fetch error:', error);
    });
}

scrape('https://packageprobe.onrender.com/')