// NODE_ENV and the rest of the config come from .env, not from here.
module.exports = {
  apps: [
    {
      name: 'crew-connect-api',
      script: 'src/server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      kill_timeout: 10000,
    },
  ],
};
