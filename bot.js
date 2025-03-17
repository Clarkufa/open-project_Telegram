const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_BOT_TOKEN = '';
const PORT = 3778;
const DB_PATH = './user_mapping.db';


const app = express();
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });


app.use(bodyParser.json());


const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Ошибка при открытии базы данных:', err);
    } else {
        db.run(`CREATE TABLE IF NOT EXISTS user_mapping (
            telegram_user_id TEXT PRIMARY KEY,
            open_project_username TEXT
        )`, (err) => {
            if (err) {
                console.error('Ошибка при создании таблицы:', err);
            }
        });
    }
});

app.post('/tghook', (req, res) => {
    try {
        const data = req.body;
        const action = data?.action;
        const taskStatus = action === 'work_package:created' ? 'создана' : action === 'work_package:updated' ? 'обновлена' : null;
        if (!taskStatus) {
            return res.status(200).json({ status: 'Действие не обрабатывается' });
        }

        const priority = data?.work_package?._embedded.priority?.name || 'Не указан';
        const project = data?.work_package?._embedded.project?.name || 'Не указан';
        const authorUsername = data?.work_package?._embedded.author?.login || null;
        const assignedUsername = data?.work_package?._embedded.assignee?.login || null;
        const taskSubject = data?.work_package?.subject || 'Без названия';
        //const taskDescription = data?.work_package?.description?.raw || 'Описание отсутствует';
        const taskId = data?.work_package?.id || 'Не указан';
        const projectId = data?.work_package?._embedded.project?.id || 'Не указан';


        const taskLink = `https://helpdesk.voice-robotics.ru/projects/${projectId}/work_packages/${taskId}/activity`;

        const sendNotification = (telegramUserId, role) => {
            const message = `🔔 <b>Задача ${taskStatus}</b>\n\n` +
                `<b>ID задачи:</b> ${taskId}\n` +
                `<b>Приоритет:</b> ${priority}\n` +
                `<b>Проект:</b> ${project}\n` +
                `<b>Роль:</b> ${role}\n` +
                `<b>Название:</b> ${taskSubject}\n` +
                `<b>Ссылка:</b> <a href=\"${taskLink}\">${taskLink}</a>\n`;
                //`<b>Описание:</b> ${taskDescription}`

            bot.sendMessage(telegramUserId, message, { parse_mode: 'HTML' })
                .catch((err) => console.error('Ошибка Telegram API:', err));
        };


        if (assignedUsername) {
            db.get('SELECT telegram_user_id FROM user_mapping WHERE open_project_username = ?', [assignedUsername], (err, row) => {
                if (err) {
                    console.error('Ошибка базы данных (исполнитель):', err);
                } else if (row) {
                    sendNotification(row.telegram_user_id, 'Исполнитель');
                }
            });
        }


        if (authorUsername) {
            db.get('SELECT telegram_user_id FROM user_mapping WHERE open_project_username = ?', [authorUsername], (err, row) => {
                if (err) {
                    console.error('Ошибка базы данных (автор):', err);
                } else if (row) {
                    sendNotification(row.telegram_user_id, 'Автор');
                }
            });
        }

        res.status(200).json({ status: 'Уведомления отправлены (если найдены пользователи).' });
    } catch (err) {
        console.error('Ошибка обработки вебхука:', err);
        res.status(500).json({ status: 'Ошибка', details: err.message });
    }
});


app.get('/', (req, res) => {
    res.send('Привет');
});


bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Добро пожаловать! Отправьте своё имя пользователя OpenProject, чтобы я мог связать ваш аккаунт.');
});

bot.on('message', (msg) => {
    if (msg.text.startsWith('/') || msg.from.is_bot) {
        return;
    }

    const telegramUserId = msg.chat.id.toString();
    const openProjectUsername = msg.text;

    db.run('REPLACE INTO user_mapping (telegram_user_id, open_project_username) VALUES (?, ?)', [telegramUserId, openProjectUsername], (err) => {
        if (err) {
            console.error('Ошибка базы данных:', err);
            bot.sendMessage(msg.chat.id, 'Произошла ошибка при привязке аккаунта. Пожалуйста, попробуйте снова.');
        } else {
            bot.sendMessage(msg.chat.id, 'Ваш аккаунт успешно привязан!');
        }
    });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
