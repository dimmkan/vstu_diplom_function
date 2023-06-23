require('dotenv').config();
const redis = require('redis');
const utils = require('./utility');

const redisHost = process.env.REDIS_HOST;

const redisClient = redis.createClient({ host: redisHost });

redisClient.on('error', (error) => {
    utils.error('[RedisSub]', error.message);
});
redisClient.on('ready', () => {
    utils.log('[RedisSub] Connected:', redisHost + ':6379');
});

redisClient.on('subscribe', (channel, count) => {
    utils.log(`[RedisSub] Subscribed to channel: ${channel} | Count of subscriptions: ${count}`);
});
redisClient.on('psubscribe', (pattern, count) => {
    utils.log(`[RedisSub] Subscribed to pattern: ${pattern} | Count of subscriptions: ${count}`);
});

exports.quit = function () {
    redisClient.quit();
}

exports.setOnMessage = function (callback) { // (channel, message) => {}
    redisClient.on('message', callback);
}

exports.setOnPmessage = function (callback) { // (pattern, channel, message) => {}
    redisClient.on('pmessage', callback);
}

exports.subscribe = function (channel) {
    redisClient.subscribe(channel);
}

exports.psubscribe = function (pattern) {
    redisClient.psubscribe(pattern);
}