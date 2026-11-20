/**
 * Automated parity test script for Express vs FastAPI Task APIs
 * Spawns both servers, tests identical endpoints, and verifies response parity.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const EXPRESS_PORT = 3000;
const FASTAPI_PORT = 8000;
const EXPRESS_URL = `http://127.0.0.1:${EXPRESS_PORT}`;
const FASTAPI_URL = `http://127.0.0.1:${FASTAPI_PORT}`;

function request(baseUrl, pathStr, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathStr, baseUrl);
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(`${url}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          if (Date.now() - start > timeoutMs) return reject(new Error(`Timeout waiting for ${url}`));
          setTimeout(check, 250);
        }
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error(`Timeout waiting for ${url}`));
        setTimeout(check, 250);
      });
    };
    check();
  });
}

async function runParityTests() {
  console.log('='.repeat(75));
  console.log('STARTING EXPRESS AND FASTAPI BACKGROUND SERVERS FOR PARITY TESTING');
  console.log('='.repeat(75));

  const rootDir = __dirname;
  const expressDir = path.join(rootDir, 'express-api');
  const fastapiDir = path.join(rootDir, 'fastapi-api');
  const pythonBin = process.platform === 'win32'
    ? path.join(fastapiDir, '.venv', 'Scripts', 'python.exe')
    : path.join(fastapiDir, '.venv', 'bin', 'python');

  console.log(`[Setup] Spawning Express server in ${expressDir}...`);
  const expressProcess = spawn(process.execPath, ['server.js'], {
    cwd: expressDir,
    stdio: 'pipe',
    env: { ...process.env, PORT: String(EXPRESS_PORT) }
  });

  console.log(`[Setup] Spawning FastAPI server in ${fastapiDir}...`);
  const fastApiProcess = spawn(pythonBin, ['main.py'], {
    cwd: fastapiDir,
    stdio: 'pipe',
    env: { ...process.env, PORT: String(FASTAPI_PORT) }
  });

  const cleanup = () => {
    try { expressProcess.kill(); } catch {}
    try { fastApiProcess.kill(); } catch {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  try {
    console.log('[Setup] Waiting for both servers to report healthy...');
    await Promise.all([
      waitForServer(EXPRESS_URL),
      waitForServer(FASTAPI_URL)
    ]);
    console.log('[Setup] Both servers are UP and responding!\n');

    console.log('='.repeat(75));
    console.log('TASK API SIDE-BY-SIDE PARITY TEST SUITE');
    console.log('='.repeat(75));

    const testCases = [
      {
        name: '1. Health check endpoint (GET /health)',
        path: '/health',
        method: 'GET',
        body: null,
        expectedStatus: 200,
        verify: (res) => res.body.status === 'ok'
      },
      {
        name: '2. List tasks (GET /tasks - seed data)',
        path: '/tasks',
        method: 'GET',
        body: null,
        expectedStatus: 200,
        verify: (res) => Array.isArray(res.body) && res.body.length >= 3
      },
      {
        name: '3. Filter tasks (GET /tasks?status=in_progress&priority=high)',
        path: '/tasks?status=in_progress&priority=high',
        method: 'GET',
        body: null,
        expectedStatus: 200,
        verify: (res) => res.body.length === 1 && res.body[0].id === 'task-1'
      },
      {
        name: '4. Get single task by ID (GET /tasks/task-2)',
        path: '/tasks/task-2',
        method: 'GET',
        body: null,
        expectedStatus: 200,
        verify: (res) => res.body.id === 'task-2' && res.body.title === 'Implement schema validation'
      },
      {
        name: '5. Non-existent task lookup (GET /tasks/non-existent-999)',
        path: '/tasks/non-existent-999',
        method: 'GET',
        body: null,
        expectedStatus: 404,
        verify: (res) => res.body.error === 'Not Found'
      },
      {
        name: '6. Create task with valid payload (POST /tasks)',
        path: '/tasks',
        method: 'POST',
        body: {
          title: 'Automated Test Ticket',
          description: 'Testing side-by-side creation in both frameworks',
          status: 'open',
          priority: 'urgent'
        },
        expectedStatus: 201,
        verify: (res) => res.body.title === 'Automated Test Ticket' && res.body.id.startsWith('task-')
      },
      {
        name: '7. Validation failure: empty whitespace title (POST /tasks)',
        path: '/tasks',
        method: 'POST',
        body: {
          title: '   ',
          priority: 'high'
        },
        expectedStatus: 422,
        verify: (res) => res.body.error === 'Validation Error' && res.body.details.length > 0
      },
      {
        name: '8. Validation failure: invalid status enum value (POST /tasks)',
        path: '/tasks',
        method: 'POST',
        body: {
          title: 'Valid title',
          status: 'invalid_status_enum'
        },
        expectedStatus: 422,
        verify: (res) => res.body.error === 'Validation Error' && res.body.details.length > 0
      },
      {
        name: '9. Partial update (PATCH /tasks/task-3)',
        path: '/tasks/task-3',
        method: 'PATCH',
        body: {
          status: 'completed'
        },
        expectedStatus: 200,
        verify: (res) => res.body.status === 'completed'
      },
      {
        name: '10. Delete task (DELETE /tasks/task-1)',
        path: '/tasks/task-1',
        method: 'DELETE',
        body: null,
        expectedStatus: 200,
        verify: (res) => res.body.message && res.body.message.includes('deleted successfully')
      }
    ];

    let passedAll = true;

    for (const tc of testCases) {
      console.log(`\nTest: ${tc.name}`);
      try {
        const [expRes, fastRes] = await Promise.all([
          request(EXPRESS_URL, tc.path, tc.method, tc.body),
          request(FASTAPI_URL, tc.path, tc.method, tc.body)
        ]);

        const expPass = expRes.status === tc.expectedStatus && tc.verify(expRes);
        const fastPass = fastRes.status === tc.expectedStatus && tc.verify(fastRes);

        console.log(`  [Express] Status: ${expRes.status} -> ${expPass ? 'PASS' : 'FAIL'}`);
        console.log(`  [FastAPI] Status: ${fastRes.status} -> ${fastPass ? 'PASS' : 'FAIL'}`);

        if (!expPass || !fastPass) {
          passedAll = false;
          console.error('  Express Response:', JSON.stringify(expRes.body, null, 2));
          console.error('  FastAPI Response:', JSON.stringify(fastRes.body, null, 2));
        }
      } catch (err) {
        console.error(`  Error during test execution: ${err.message || err.toString()}`);
        passedAll = false;
      }
    }

    console.log('\n' + '='.repeat(75));
    if (passedAll) {
      console.log('SUMMARY: ALL 10 PARITY TESTS PASSED ACCORDING TO SPECIFICATION!');
    } else {
      console.log('SUMMARY: SOME TESTS ENCOUNTERED MISMATCHES.');
    }
    console.log('='.repeat(75));
  } finally {
    cleanup();
  }
}

if (require.main === module) {
  runParityTests().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runParityTests };
