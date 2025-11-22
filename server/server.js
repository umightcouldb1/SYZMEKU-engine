{
  "name": "server",
  "version": "1.0.0",
  "description": "API server for SYZMEKU engine",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "watch": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^8.0.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
