const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { z } = require('zod');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(express.json());

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON payload'
    });
  }
  next(err);
});

const tasks = [
  {
    id: 'task-1',
    title: 'Set up CI/CD pipeline',
    description: 'Configure GitHub Actions for automated testing and linting',
    status: 'in_progress',
    priority: 'high',
    created_at: '2026-11-20T08:00:00.000Z',
    updated_at: '2026-11-20T08:00:00.000Z'
  },
  {
    id: 'task-2',
    title: 'Implement schema validation',
    description: 'Add Pydantic and Zod validation schemas for request bodies',
    status: 'completed',
    priority: 'medium',
    created_at: '2026-11-20T08:30:00.000Z',
    updated_at: '2026-11-20T09:00:00.000Z'
  },
  {
    id: 'task-3',
    title: 'Draft API documentation',
    description: 'Compare Express and FastAPI side-by-side with curl examples',
    status: 'open',
    priority: 'urgent',
    created_at: '2026-11-20T09:15:00.000Z',
    updated_at: '2026-11-20T09:15:00.000Z'
  }
];

const TaskStatusEnum = z.enum(['open', 'in_progress', 'completed', 'cancelled'], {
  errorMap: () => ({ message: "Status must be one of: 'open', 'in_progress', 'completed', 'cancelled'" })
});

const TaskPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent'], {
  errorMap: () => ({ message: "Priority must be one of: 'low', 'medium', 'high', 'urgent'" })
});

const CreateTaskSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, { message: 'Title must not be empty' })
    .max(100, { message: 'Title must be at most 100 characters long' }),
  description: z.string().trim().default(''),
  status: TaskStatusEnum.default('open'),
  priority: TaskPriorityEnum.default('medium')
});

const UpdateTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: 'Title must not be empty' })
    .max(100, { message: 'Title must be at most 100 characters long' })
    .optional(),
  description: z.string().trim().optional(),
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

// Middleware generator for request validation
const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.errors.map(err => ({
      field: err.path.join('.') || 'body',
      message: err.message
    }));
    return res.status(422).json({
      error: 'Validation Error',
      details
    });
  }
  req.validatedBody = result.data;
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'express-task-api',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the Task Tracker API (Express)',
    docs: '/tasks',
    health: '/health'
  });
});

/**
 * GET /tasks
 * Retrieve tasks with optional query filters: ?status=...&priority=...&search=...
 */
app.get('/tasks', (req, res) => {
  const { status, priority, search } = req.query;
  let results = [...tasks];

  if (status) {
    results = results.filter(task => task.status === status);
  }

  if (priority) {
    results = results.filter(task => task.priority === priority);
  }

  if (search) {
    const term = search.toLowerCase();
    results = results.filter(
      task =>
        task.title.toLowerCase().includes(term) ||
        task.description.toLowerCase().includes(term)
    );
  }

  res.status(200).json(results);
});

/**
 * GET /tasks/:id
 * Retrieve a single task by ID
 */
app.get('/tasks/:id', (req, res) => {
  const { id } = req.params;
  const task = tasks.find(t => t.id === id);

  if (!task) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Task with ID '${id}' not found`
    });
  }

  res.status(200).json(task);
});

/**
 * POST /tasks
 * Create a new task with validated body
 */
app.post('/tasks', validateBody(CreateTaskSchema), (req, res) => {
  const now = new Date().toISOString();
  const newTask = {
    id: `task-${crypto.randomUUID().slice(0, 8)}`,
    ...req.validatedBody,
    created_at: now,
    updated_at: now
  };

  tasks.push(newTask);
  res.status(201).json(newTask);
});

/**
 * PATCH /tasks/:id
 * Partially update an existing task
 */
app.patch('/tasks/:id', validateBody(UpdateTaskSchema), (req, res) => {
  const { id } = req.params;
  const taskIndex = tasks.findIndex(t => t.id === id);

  if (taskIndex === -1) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Task with ID '${id}' not found`
    });
  }

  const existingTask = tasks[taskIndex];
  const updatedTask = {
    ...existingTask,
    ...req.validatedBody,
    updated_at: new Date().toISOString()
  };

  tasks[taskIndex] = updatedTask;
  res.status(200).json(updatedTask);
});

/**
 * DELETE /tasks/:id
 * Remove a task by ID
 */
app.delete('/tasks/:id', (req, res) => {
  const { id } = req.params;
  const taskIndex = tasks.findIndex(t => t.id === id);

  if (taskIndex === -1) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Task with ID '${id}' not found`
    });
  }

  tasks.splice(taskIndex, 1);
  res.status(200).json({
    message: `Task '${id}' deleted successfully`
  });
});


// Catch-all for undefined routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Express] Task API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
