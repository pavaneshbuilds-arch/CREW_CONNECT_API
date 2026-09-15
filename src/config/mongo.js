import mongoose from 'mongoose';
import config from './env.js';
import logger from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectMongo() {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
  logger.info('MongoDB (Mongoose) connected');
}

export async function disconnectMongo() {
  await mongoose.disconnect();
  logger.info('MongoDB (Mongoose) disconnected');
}

export { mongoose };
