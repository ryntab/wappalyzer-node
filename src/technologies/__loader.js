import fs from 'fs/promises';

const load_technologies = async () => {
    const technologies = {};
    const promises = Array.from(Array(27).keys()).map(async (index) => {
        const character = index ? String.fromCharCode(index + 96) : '_';
        const file = await fs.readFile(`./src/technologies/${character}.json`, 'utf8');
        return JSON.parse(file);
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
