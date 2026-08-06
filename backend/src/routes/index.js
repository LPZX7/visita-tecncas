const express = require('express');
const authRouter = require('./auth');
const usersRouter = require('./users');
const companiesRouter = require('./companies');
const unitsRouter = require('./units');
const equipmentsRouter = require('./equipments');
const partsRouter = require('./parts');
const rulesRouter = require('./rules');
const requestsRouter = require('./requests');
const budgetsRouter = require('./budgets');
const publicBudgetsRouter = require('./publicBudgets');
const contractsRouter = require('./contracts');
const notificationsRouter = require('./notifications');

const router = express.Router();
router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/companies', companiesRouter);
router.use('/units', unitsRouter);
router.use('/equipments', equipmentsRouter);
router.use('/parts', partsRouter);
router.use('/rules', rulesRouter);
router.use('/requests', requestsRouter);
router.use('/budgets', budgetsRouter);
router.use('/public/budgets', publicBudgetsRouter);
router.use('/contracts', contractsRouter);
router.use('/notifications', notificationsRouter);

module.exports = router;
