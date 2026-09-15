import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import crewRoutes from './crew.routes.js';
import uploadRoutes from './upload.routes.js';
import adminRoutes from './admin.routes.js';

/**
 * Assembles the versioned API router and mounts each domain's routes. This is
 * the single entry point the app imports for routing.
 */
class ApiRouter {
  constructor() {
    this.router = Router();
    this.mountRoutes();
  }

  mountRoutes() {
    this.router.get('/', (req, res) => {
      res.json({ success: true, data: { name: 'Crew Connect API', version: '0.1.0' } });
    });

    this.router.use('/auth', authRoutes);
    this.router.use('/users', userRoutes);
    this.router.use('/crew', crewRoutes);
    this.router.use('/uploads', uploadRoutes);
    this.router.use('/admin', adminRoutes);
  }
}

export default new ApiRouter().router;
