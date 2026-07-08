import net from "node:net";

const PORT_CHECK_HOSTS = Object.freeze([null, "127.0.0.1", "::1"]);

export async function findAvailablePort(startPort, searchLimit) {
  for (let offset = 0; offset <= searchLimit; offset += 1) {
    const port = startPort + offset;
    if (await canListenOnAllHosts(port)) {
      return port;
    }
  }
  throw new Error(`No available Expo port from ${startPort} through ${startPort + searchLimit}.`);
}

export function parsePort(value) {
  if (!value) return null;
  const port = Number.parseInt(String(value), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return port;
}

async function canListenOnAllHosts(port) {
  for (const host of PORT_CHECK_HOSTS) {
    if (!(await canListen(port, host))) return false;
  }
  return true;
}

function canListen(port, host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }
      if (error.code === "EADDRNOTAVAIL" && host === "::1") {
        resolve(true);
        return;
      }
      reject(error);
    });
    const listenArgs = host ? [port, host] : [port];
    server.listen(...listenArgs, () => {
      server.close(() => resolve(true));
    });
  });
}
