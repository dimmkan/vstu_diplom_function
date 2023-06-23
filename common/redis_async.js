require('dotenv').config();
const redis = require('redis');
const utils = require('./utility');
const { promisify } = require('util');

const redisHost = process.env.REDIS_HOST;

const redisClient = redis.createClient({ host: redisHost });

redisClient.on('error', (error) => {
    utils.error('[Redis]', error.message);
});
redisClient.on('ready', () => {
    utils.log('[Redis] Connected:', redisHost + ':6379');
});

exports.quit = function () {
    redisClient.quit();
}

exports.publish = promisify(redisClient.publish).bind(redisClient);

exports.set = promisify(redisClient.set).bind(redisClient);

exports.expire = promisify(redisClient.expire).bind(redisClient);

exports.ttl = promisify(redisClient.ttl).bind(redisClient);

exports.setex = promisify(redisClient.setex).bind(redisClient);

exports.incr = promisify(redisClient.incr).bind(redisClient);

exports.decr = promisify(redisClient.decr).bind(redisClient);

exports.get = promisify(redisClient.get).bind(redisClient);

exports.del = promisify(redisClient.del).bind(redisClient);

exports.keys = promisify(redisClient.keys).bind(redisClient);