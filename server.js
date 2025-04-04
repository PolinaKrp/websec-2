const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
require('dotenv').config();

const configureServer = () => {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const YANDEX_API_KEY = process.env.YANDEX_API_KEY;

  app.use(cors());
  app.use(express.static('client'));

  const handleApiError = (error, res) => {
    if (error.response) {
      console.error('Ошибка API:', error.response.data);
      res.status(error.response.status).json({
        error: error.response.data.message || 'Ошибка API'
      });
    } else if (error.request) {
      console.error('Нет ответа API:', error.request);
      res.status(503).json({ error: 'Сервис временно недоступен' });
    } else {
      console.error('Ошибка сервера:', error.message);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  };

  const processStationsData = (data) => {
    const russia = data.countries?.find(country =>
      country.codes?.yandex_code === 'ru' ||
      country.title === 'Россия' ||
      country.title === 'Russia'
    );

    return {
      stations: russia?.regions?.flatMap(region =>
        region.settlements?.flatMap(settlement =>
          settlement.stations?.map(station => ({
            title: station.title,
            code: station.codes.yandex_code,
            lat: station.lat,
            lng: station.lng,
            transport_type: station.transport_type
          })) || []
        ) || []
      ) || []
    };
  };

  const setupRoutes = () => {
    app.get('/api/allStations', async (req, res) => {
      try {
        const response = await axios.get('https://api.rasp.yandex.net/v3.0/stations_list/', {
          params: {
            apikey: YANDEX_API_KEY,
            format: 'json',
            lang: 'ru_RU'
          }
        });
        res.json(processStationsData(response.data));
      } catch (error) {
        handleApiError(error, res);
      }
    });

    app.get('/api/schedule', async (req, res) => {
      const station = req.query.station?.trim();
      if (!station) return res.status(400).json({ error: 'Требуется код станции' });

      try {
        const response = await axios.get('https://api.rasp.yandex.net/v3.0/schedule', {
          params: {
            apikey: YANDEX_API_KEY,
            station,
            transport_types: 'train, suburban',
            lang: 'ru_RU',
            format: 'json'
          }
        });
        res.json(response.data);
      } catch (error) {
        handleApiError(error, res);
      }
    });

    app.get('/api/nearestStations', async (req, res) => {
      const { lat, lng, distance = 50 } = req.query;

      try {
        const response = await axios.get('https://api.rasp.yandex.net/v3.0/nearest_stations/', {
          params: {
            apikey: YANDEX_API_KEY,
            lat: lat,
            lng: lng,
            distance: distance,
            transport_types: 'train, suburban',
            lang: 'ru_RU',
            format: 'json'
          }
        });

        res.json(response.data);
      } catch (error) {
        handleApiError(error, res);
      }
    });

    app.get('/api/searchRoutes', async (req, res) => {
      const { from, to } = req.query;
      if (!from || !to) return res.status(400).json({ error: 'Поля "Отправление" и "Прибытие" обязательны для заполнения' });

      try {
        const response = await axios.get('https://api.rasp.yandex.net/v3.0/search/', {
          params: {
            apikey: YANDEX_API_KEY,
            from,
            to,
            transport_types: 'train, suburban',
            lang: 'ru_RU'
          }
        });
        res.json({ routes: response.data.segments });
      } catch (error) {
        console.error('Ошибка поиска маршрута:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
      }
    });
  };

  const start = () => {
    setupRoutes();
    app.listen(PORT, () => {
      console.log(`Сервер запущен: http://localhost:${PORT}`);
    });
  };

  return { start };
};

const server = configureServer();
server.start();