import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current module's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const load_technologies = async () => {
    const technologies = {};
    const directory = path.join(__dirname); // Ensure path is correct
    const promises = Array.from(Array(27).keys()).map(async (index) => {
        const character = index ? String.fromCharCode(index + 96) : '_';
        const filePath = path.join(directory, `${character}.json`);

        try {
            const file = await fs.readFile(filePath, 'utf8');
            return JSON.parse(file);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`File not found: ${filePath}`);
                return {};
            }
            throw error;
        }
    });

    const results = await Promise.all(promises);

    results.forEach(parsed => {
        Object.assign(technologies, parsed);
    });

    return technologies;
};

export {
    load_technologies
};
