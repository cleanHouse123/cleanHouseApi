const axios = require('axios');

const token = 'AAEYJQAAh43tuSpLbRnlRl9pHYqzeN6gCVSHd9OB46JbbQ';
const phoneNumber = '+79123456789';

async function testTelegramGateway() {
  try {
    console.log('Тестируем Telegram Gateway API...');
    console.log('Токен:', token);
    console.log('Номер:', phoneNumber);
    
    const response = await axios.post('https://gatewayapi.telegram.org/checkSendAbility', {
      phone_number: phoneNumber,
      access_token: token
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Ответ:', response.data);
  } catch (error) {
    console.error('Ошибка:', error.response?.data || error.message);
  }
}

testTelegramGateway();
