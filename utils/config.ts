import fs from 'fs';
import yaml from 'yaml';
import path from 'path';

const configPath = path.join(__dirname, '../config.yml');
let config: any = {};

try {
    const file = fs.readFileSync(configPath, 'utf8');
    config = yaml.parse(file);
    console.log('Configuration utility initialized with:', config);
} catch (e) {
    console.error('Failed to load config.yml at', configPath, e);
}

export default config;
