export default (url) => {
  let hostname;
  const start = performance.now();
  if (url.indexOf("//") > -1) {
    hostname = url.split("/")[2];
  } else {
    hostname = url.split("/")[0];
  }
  hostname = hostname.split(":")[0];
  hostname = hostname.split("?")[0];
  const end = performance.now();
  return {
    hostname: hostname,
    duration: end - start,
  };
};
