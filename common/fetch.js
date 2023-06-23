const utils = require('./utility');
const fetch = require('node-fetch');
const ntlm = require('httpntlm').ntlm;
const http = require('http');

const keepAlive = new http.Agent({ keepAlive: true });

const apiUrl = process.env.API_URL;
const username = process.env.NTLM_USERNAME;
const password = process.env.NTLM_PASSWORD;

const statusDescriptionRu = {
    400: 'Некорректный запрос',
    401: 'Ошибка авторизации',
    403: 'Доступ запрещен',
    404: 'Не найдено',
    500: 'Внутренняя ошибка сервера',
    502: 'Неверный адрес шлюза',
    503: 'Сервис временно недоступен',
    504: 'Истекло время ожидания ответа',
};

const authOpts = {
    username,
    password,
    domain: '',
    workstation: '',
};

const handshake = async (url, authOpts) => await fetch(url, {
    headers: {
        Connection: 'keep-alive',
        Authorization: ntlm.createType1Message(authOpts),
    },
    agent: keepAlive,
})
    .then(response => response.headers.get('www-authenticate'))
    .then((auth) => {
        if (!auth) {
            throw new Error('Stage 1 NTLM handshake failed.');
        }

        const type2 = ntlm.parseType2Message(auth);
        return ntlm.createType3Message(type2, authOpts);
    });

exports.sendPost = async function (method, parameters) {
    try {
        const auth = await handshake(`${apiUrl}${method}`, authOpts).then((auth) => auth);
        const result = await fetch(`${apiUrl}${method}`, {
            method: 'POST',
            body: JSON.stringify({ request: parameters }),
            headers: {
                Authorization: auth,
                'Content-Type': 'application/json',
                Connection: 'keep-alive',
            },
            agent: keepAlive,
            timeout: 3000000,
        });
        if(result.status === 200) {
            const data = await result.json();
            return { code: result?.status ?? 598, message: data.response || data };
        }else {
            return { code: result.status, message: result.statusText, description: statusDescriptionRu[result.status] || result.statusText };
        }        
    } catch (error) {
        utils.error('[Fetch] Error: ', error.message);
        return { code: 599, message: error.message, description: 'Ошибка выполнения запроса' };
    }
}
