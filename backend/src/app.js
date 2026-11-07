'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');

const config = require('./config');
const logger = require('./config/logger');
const productRoutes = require('./routes/products');
const dashboardRoutes = require('./routes/dashboard');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
// Behind the ALB / API Gateway: trust one proxy hop so rate limiting sees real client IPs.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: config.cors.origins }));
app.use(express.json({ limit: '100kb' }));
app.use(
  pinoHttp({
    logger,
    // Don't spam CloudWatch with load balancer health checks.
    autoLogging: { ignore: (req) => req.url === '/health' },
  })
);

// Health check: used by the ALB target group and the Docker HEALTHCHECK. Keep it dependency-free.
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/products', productRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
