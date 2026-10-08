const Redis = require('ioredis');
const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: null, // disable retries
    retryStrategy: (times) => Math.min(times * 50, 2000), // exponential backoff
    reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.slice(0, targetError.length) === targetError) {
            // Only reconnect when the error starts with "READONLY"
            return true; // or `return 1;`
        }
        return false;
    },
    maxConnectionAge: 1000 * 60 * 30, // 30 minutes
    maxInflightRequests: 15, // maximum number of inflight requests
    lazyConnect: true, // connect to Redis when the first command is issued
});

// redis.ping(function (err, result) {
//     if (err) {
//         console.log('Error connecting to Redis:', err);
//     } else {
//         console.log('Successfully connected to Redis:', result);
//     }
// });

async function testRedisConnection() {
    try {
        const result = await redis.ping();
        console.log('Successfully connected to Redis:', result);
    } catch (err) {
        console.log('Error connecting to Redis:', err);
    } 
};
testRedisConnection();

module.exports = redis;


