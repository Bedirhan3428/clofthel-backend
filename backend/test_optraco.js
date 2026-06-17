const axios = require('axios');

async function main() {
  const targetUrl = 'https://optraco.top/plateau/9c2759b3-1061-439b-8899-f45756ffc804/02997E7650E6BB9EA17403D95466B84495D58913.m3u8';
  const workerUrl = `https://clofthel-proxy.abimer2350.workers.dev/?url=${encodeURIComponent(targetUrl)}`;
  
  console.log(`Fetching via Worker: ${workerUrl}`);
  try {
    const res = await axios.get(workerUrl);
    console.log("Status:", res.status);
    console.log("CORS Header:", res.headers['access-control-allow-origin']);
    console.log("Snippet:", res.data.substring(0, 200));
  } catch (err) {
    console.error("Error:", err.message);
    if (err.response) {
      console.log("Error status:", err.response.status);
      console.log("Error headers:", err.response.headers);
      console.log("Error data:", err.response.data);
    }
  }
}

main().catch(console.error);
