const express = require('express');
const { program } = require('commander');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

program
  .requiredOption('-h, --host <host>', 'Адреса сервера')
  .requiredOption('-p, --port <port>', 'Порт сервера', parseInt)
  .requiredOption('-c, --cache <path>', 'Шлях до директорії для кешування файлів');
program.parse(process.argv);
const { host, port, cache } = program.opts();

if (!fs.existsSync(cache)) {
    fs.mkdirSync(cache, { recursive: true });
}

const app = express();
const absoluteCachePath = path.resolve(cache);
const upload = multer({ dest: absoluteCachePath });
const inventoryList = [];
let nextId = 1;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const getPhotoUrl = (id) => `/inventory/${id}/photo`;

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Inventory Management API',
        version: '1.0.0',
        description: 'API для управління інвентарем, включаючи реєстрацію, пошук та оновлення даних про речі.',
    },
    servers: [
        {
            url: `http://${host}:${port}`,
            description: 'Локальний сервер розробки',
        },
    ],
    components: {
        schemas: {
            InventoryItem: {
                type: 'object',
                required: ['ID', 'InventoryName'],
                properties: {
                    ID: { type: 'integer', description: 'Унікальний ідентифікатор речі.' },
                    InventoryName: { type: 'string', description: 'Назва речі.' },
                    Description: { type: 'string', description: 'Опис речі.' },
                    PhotoFilename: { type: 'string', nullable: true, description: 'Ім\'я файлу фотографії в кеші.' },
                    PhotoUrl: { type: 'string', nullable: true, description: 'URL для доступу до фотографії.' },
                }
            },
            Error: {
                type: 'object',
                properties: {
                    error: { type: 'string', description: 'Повідомлення про помилку.' }
                }
            }
        }
    }
};

const swaggerOptions = {
    swaggerDefinition,
    apis: [__filename],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нової речі в інвентарі
 *     description: Додає нову річ до списку інвентарю, опціонально з фотографією.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Назва речі.
 *               description:
 *                 type: string
 *                 description: Опис речі (опціонально).
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Файл фотографії (опціонально).
 *     responses:
 *       201:
 *         description: Річ успішно зареєстрована.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       400:
 *         description: Некоректний запит, відсутнє обов'язкове поле.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/register', upload.single('photo'), (req, res) => {
    const { inventory_name, description } = req.body;
    if (!inventory_name) {
        return res.status(400).send({ error: 'Поле inventory_name є обов\'язковим.' });
    }
    const newInventory = {
        ID: nextId++,
        InventoryName: inventory_name,
        Description: description || '',
        PhotoFilename: req.file ? req.file.filename : null,
        PhotoUrl: req.file ? getPhotoUrl(nextId - 1) : null
    };
    inventoryList.push(newInventory);
    res.status(201).json(newInventory);
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримання списку всіх речей
 *     description: Повертає масив всіх зареєстрованих речей в інвентарі.
 *     responses:
 *       200:
 *         description: Список речей.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/InventoryItem'
 */
app.get('/inventory', (req, res) => {
    res.status(200).json(inventoryList.map(item => ({
        ...item,
        PhotoUrl: item.PhotoFilename ? getPhotoUrl(item.ID) : null
    })));
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримання інформації про річ за ID
 *     description: Повертає інформацію про річ за її унікальним ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Унікальний ID речі.
 *     responses:
 *       200:
 *         description: Інформація про річ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       404:
 *         description: Річ з таким ID не знайдена.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/inventory/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const item = inventoryList.find(i => i.ID === id);
    if (!item) {
        return res.status(404).send({ error: 'Річ з таким ID не знайдена.' });
    }
    res.status(200).json({
        ...item,
        PhotoUrl: item.PhotoFilename ? getPhotoUrl(id) : null
    });
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновлення назви або опису речі
 *     description: Оновлює назву та/або опис речі за її ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Унікальний ID речі.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Нова назва речі (опціонально).
 *               description:
 *                 type: string
 *                 description: Новий опис речі (опціонально).
 *     responses:
 *       200:
 *         description: Річ успішно оновлена.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       404:
 *         description: Річ з таким ID не знайдена.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.put('/inventory/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const item = inventoryList.find(i => i.ID === id);
    if (!item) {
        return res.status(404).send({ error: 'Річ з таким ID не знайдена.' });
    }
    const { inventory_name, description } = req.body;
    if (inventory_name !== undefined) item.InventoryName = inventory_name;
    if (description !== undefined) item.Description = description;
    res.status(200).json(item);
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримання фотографії речі
 *     description: Повертає файл фотографії речі за її ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Унікальний ID речі.
 *     responses:
 *       200:
 *         description: Файл зображення.
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Фото або річ з таким ID не знайдена, або файл відсутній у кеші.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/inventory/:id/photo', (req, res) => {
    const id = parseInt(req.params.id);
    const item = inventoryList.find(i => i.ID === id);
    if (!item || !item.PhotoFilename) {
        return res.status(404).send({ error: 'Фото або річ з таким ID не знайдена.' });
    }
    const filePath = path.join(absoluteCachePath, item.PhotoFilename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send({ error: 'Файл фото відсутній у кеші.' });
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.status(200).sendFile(filePath);
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновлення фотографії речі
 *     description: Замінює існуючу фотографію речі за її ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Унікальний ID речі.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - photo
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Новий файл фотографії.
 *     responses:
 *       200:
 *         description: Фотографія успішно оновлена.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       400:
 *         description: Файл фото не надано.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Річ з таким ID не знайдена.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
    const id = parseInt(req.params.id);
    const item = inventoryList.find(i => i.ID === id);
    if (!item) {
        return res.status(404).send({ error: 'Річ з таким ID не знайдена.' });
    }
    if (!req.file) {
        return res.status(400).send({ error: 'Файл фото не надано.' });
    }
    item.PhotoFilename = req.file.filename;
    item.PhotoUrl = getPhotoUrl(id);
    res.status(200).json(item);
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалення речі
 *     description: Видаляє річ з інвентарю за її ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Унікальний ID речі.
 *     responses:
 *       200:
 *         description: Річ успішно видалена.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Річ з ID 1 успішно видалена.
 *       404:
 *         description: Річ з таким ID не знайдена.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.delete('/inventory/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = inventoryList.findIndex(i => i.ID === id);
    if (index === -1) {
        return res.status(404).send({ error: 'Річ з таким ID не знайдена.' });
    }
    inventoryList.splice(index, 1);
    res.status(200).send({ message: `Річ з ID ${id} успішно видалена.` });
});

/**
 * @swagger
 * /RegisterForm.html:
 *   get:
 *     summary: Отримання HTML-форми реєстрації
 *     description: Повертає HTML-сторінку для реєстрації нової речі.
 *     responses:
 *       200:
 *         description: HTML-файл форми.
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'RegisterForm.html'));
});

/**
 * @swagger
 * /SearchForm.html:
 *   get:
 *     summary: Отримання HTML-форми пошуку
 *     description: Повертає HTML-сторінку для пошуку речі.
 *     responses:
 *       200:
 *         description: HTML-файл форми.
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'SearchForm.html'));
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук речі за ID (через Form Data)
 *     description: Шукає річ за ID і опціонально включає посилання на фото.
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: ID речі для пошуку.
 *               includePhoto:
 *                 type: string
 *                 enum: [on]
 *                 description: Увімкнути посилання на фото.
 *     responses:
 *       200:
 *         description: Знайдена річ.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ID:
 *                   type: integer
 *                 InventoryName:
 *                   type: string
 *                 Description:
 *                   type: string
 *                 PhotoUrl:
 *                   type: string
 *                   nullable: true
 *       400:
 *         description: Недійсний ID для пошуку.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Річ не знайдена.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/search', (req, res) => {
    const { id, includePhoto } = req.body;
    const searchId = parseInt(id);
    if (isNaN(searchId)) {
        return res.status(400).send({ error: 'Недійсний ID для пошуку.' });
    }
    const item = inventoryList.find(i => i.ID === searchId);
    if (!item) {
        return res.status(404).send({ error: `Річ з ID ${id} не знайдена.` });
    }
    const responseData = {
        ID: item.ID,
        InventoryName: item.InventoryName,
        Description: item.Description
    };
    if (includePhoto === 'on' && item.PhotoFilename) {
        responseData.PhotoUrl = getPhotoUrl(item.ID);
    }
    res.status(200).json(responseData);
});

app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'DELETE') {
        return res.status(405).send({ error: 'Метод не дозволено (Method not allowed)' });
    }
    res.status(404).send({ error: 'Ресурс не знайдено' });
});

app.listen(port, host, () => {
    console.log(`Сервер запущено на http://${host}:${port}`);
    console.log(`Кеш-директорія: ${cache}`);
    console.log(`Документація Swagger UI доступна на http://${host}:${port}/docs`);
});