require('dotenv').config({ path: '.env.development' });
console.log('TELEGRAM_GATEWAY_TOKEN:', process.env.TELEGRAM_GATEWAY_TOKEN);
console.log('NODE_ENV:', process.env.NODE_ENV);
