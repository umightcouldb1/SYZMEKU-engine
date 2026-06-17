const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');

function askLocalAI(prompt) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: "qwen2.5-coder:7b",
            prompt: prompt,
            stream: false
        });

        const options = {
            hostname: 'localhost',
            port: 11434,
            path: '/api/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => responseBody += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseBody);
                    resolve(parsed.response);
                } catch (e) {
                    reject("Error reading local AI stream.");
                }
            });
        });

        req.on('error', (err) => reject("Ollama service not detected: " + err.message));
        req.write(data);
        req.end();
    });
}

function deployToGithub(commitMessage) {
    try {
        console.log("Staging modified assets...");
        execSync('git add .');
        console.log(`Applying system commit: "${commitMessage}"`);
        execSync(`git commit -m "${commitMessage}"`);
        console.log("Pushing autonomously to GitHub branch...");
        execSync('git push');
        console.log("Deployment verified. Repository updated successfully.");
    } catch (err) {
        console.error("Git automation halted: ", err.message);
    }
}

async function runMission(instruction, targetFile) {
    console.log(`Analyzing local file: ${targetFile}`);
    let currentCode = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : "";

    const systemContext = `You are a localized developer agent. Modify the code file based strictly on the user instruction. Return ONLY the raw code inside a standard markdown code block. Do not provide explanations or chat.\n\nFile: ${targetFile}\nExisting Code:\n${currentCode}\n\nInstruction: ${instruction}`;

    try {
        const rawAiOutput = await askLocalAI(systemContext);
        const codeCleaned = rawAiOutput.replace(/```javascript|```/g, '').trim();
        
        fs.writeFileSync(targetFile, codeCleaned, 'utf8');
        console.log(`Local update complete for ${targetFile}.`);

        deployToGithub(`Autonomous patch: ${instruction}`);
    } catch (err) {
        console.error("Mission execution failed: ", err);
    }
}

const userInstruction = process.argv[2];
const targetFile = process.argv[3];

if (userInstruction && targetFile) {
    runMission(userInstruction, targetFile);
} else {
    console.log("Usage: node auto-developer.js \"[instruction]\" \"[file_path]\"");
}