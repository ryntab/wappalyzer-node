import { wappalyzer } from "./index.js";

export async function run(url) {
  try {
    const result = await wappalyzer.scan(url);

    if (result.error) {
      console.error("Scan failed:", result.error);
      process.exitCode = 1;
      return;
    }

    const names = (result.technologies || []).map((tech) => tech.name);
    console.log(`Detected ${names.length} technologies for ${url}`);

    if (names.length) {
      console.log(names.join(", "));
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Unexpected error:", error);
    process.exitCode = 1;
  } finally {
    await wappalyzer.shutdown();
  }
}

export default run;
