$(document).ready(() => {
  const App = {
    config: {
      apiEndpoint: '/api',
      mapApiKey: '6485f6e4-7947-44bc-8ac4-5149b6642cd7',
      minSearchLength: 2
    },

    elements: {
      searchInput: $('#stationSearch'),
      searchResults: $('#searchResults'),
      scheduleView: $('#scheduleView'),
      favoritesList: $('#favoritesList'),
      searchButton: $('#searchButton'),
      locateButton: $('#locateButton'),
      currentTime: $('#currentTime')
    },

    state: {
      favorites: JSON.parse(localStorage.getItem('favorites')) || [],
      allStations: [],
      map: null,
      currentLocation: null
    },

    init() {
      this.verifyElements();
      this.loadYandexMap();
      this.setupEventListeners();
      this.loadStations();
      this.renderFavorites();
      this.startClock();
    },

    verifyElements() {
      if (this.elements.searchInput.length === 0) {
        console.error('ОШИБКА: Элемент #stationSearch не найден');
      }
    },

    loadYandexMap() {
      const script = document.createElement('script');
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${this.config.mapApiKey}&lang=ru_RU`;
      script.onload = () => this.initYandexMap();
      document.head.appendChild(script);
    },

    initYandexMap() {
      ymaps.ready(() => {
        this.state.map = new ymaps.Map('yandexMap', {
          center: [53.195878, 50.100202],
          zoom: 10,
          controls: ['zoomControl', 'geolocationControl']
        });

        this.setMapEvents();
        this.initGeoLocation();
      });
    },

    setMapEvents() {
      let isDragging = false;

      this.state.map.events
        .add('actionbegin', () => isDragging = true)
        .add('actionend', () => isDragging = false)
        .add('click', e => {
          if (!isDragging) this.handleMapClick(e.get('coords'));
        });
    },

    initGeoLocation() {
      if (!navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        position => {
          this.state.currentLocation = [
            position.coords.latitude,
            position.coords.longitude
          ];
          this.state.map.setCenter(this.state.currentLocation, 14);
        },
        error => console.error('Ошибка геолокации:', error)
      );
    },

    async loadStations() {
      try {
        const response = await fetch(`${this.config.apiEndpoint}/allStations`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        const data = await response.json();
        this.state.allStations = data.stations;
        console.log('Станции загружены:', this.state.allStations.length);
      } catch (error) {
        console.error('Ошибка загрузки станций:', error);
        this.showError('Не удалось загрузить список станций');
      }
    },

    handleSearch() {
      const query = this.elements.searchInput.val().trim();
      console.log('Поисковый запрос:', query);

      if (!this.state.allStations.length) {
        console.error('Станции не загружены');
        return;
      }

      if (query.length < this.config.minSearchLength) {
        this.clearSearchResults();
        return;
      }

      const results = this.searchStations(query);
      this.showSearchResults(results);
    },

    searchStations(query) {
      const normalizedQuery = query.toLowerCase().trim();

      return this.state.allStations
        .filter(station =>
          station.title.toLowerCase().includes(normalizedQuery) &&
          station.transport_type === 'train'
        )
        .filter((station, index, self) =>
          self.findIndex(s => s.title === station.title) === index
        );
    },

    showSearchResults(stations) {
      this.clearSearchResults();

      if (stations.length === 0) {
        this.elements.searchResults.append(
          '<div class="search-result-item-nofound">Станций не найдено</div>'
        );
        return;
      }

      stations.forEach(station => {
        this.elements.searchResults.append(`
              <div class="search-result-item" 
                   data-code="${station.code}" 
                   data-title="${station.title}">
                  <div class="station-info">
                      ${station.title}
                      <small>(${station.transport_type === 'suburban' ? 'электричка' : 'поезд'})</small>
                  </div>
                  <button class="add-favorite-btn">
                      <i class="far fa-star"></i>
                  </button>
              </div>
          `);
      });

      this.elements.searchResults.show();
    },

    handleStationSelect(e) {
      const $target = $(e.currentTarget);
      const code = $target.data('code');
      const title = $target.data('title');

      this.loadSchedule(title, code);
      this.clearSearch();
    },

    handleAddFavorite(e) {
      e.stopPropagation();
      const $item = $(e.target).closest('.search-result-item');
      const station = {
        code: $item.data('code'),
        title: $item.data('title')
      };

      if (!this.isFavorite(station.code)) {
        this.addToFavorites(station);
        this.showFeedback('Станция добавлена в избранное ★');
        $item.find('.fa-star').replaceWith('<i class="fas fa-star text-warning"></i>');
      }
    },

    addToFavorites(station) {
      this.state.favorites.push(station);
      localStorage.setItem('favorites', JSON.stringify(this.state.favorites));
      this.renderFavorites();
    },

    isFavorite(code) {
      return this.state.favorites.some(f => f.code === code);
    },

    renderFavorites() {
      this.elements.favoritesList.empty();

      if (this.state.favorites.length === 0) {
        this.elements.favoritesList.append(`
          <div class="empty-state">
            <i class="fas fa-star"></i>
            <p>Добавьте станции в избранное</p>
          </div>
        `);
        return;
      }

      this.state.favorites.forEach(station => {
        this.elements.favoritesList.append(`
          <div class="favorite-item" data-code="${station.code}">
            <span>${station.title}</span>
            <button class="remove-favorite-btn">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `);
      });
    },

    handleRemoveFavorite(e) {
      const code = $(e.target).closest('.favorite-item').data('code');
      this.state.favorites = this.state.favorites.filter(f => f.code !== code);
      localStorage.setItem('favorites', JSON.stringify(this.state.favorites));
      this.renderFavorites();
      this.showFeedback('Станция удалена из избранного');
    },

    async loadSchedule(title, code) {
      try {
        this.showLoading();
        const response = await fetch(`${this.config.apiEndpoint}/schedule?station=${code}`);
        const data = await response.json();
        this.displaySchedule(title, data);
      } catch (error) {
        this.showError('Ошибка загрузки расписания');
      }
    },

    displaySchedule(title, data) {
      this.elements.scheduleView.empty();

      if (!data?.schedule?.length) {
        this.showNoSchedule();
        return;
      }

      const uniqueTrains = {};
      const $schedule = $('<div class="schedule-list"></div>');

      data.schedule.forEach(train => {
        if (!uniqueTrains[train.thread.title]) {
          uniqueTrains[train.thread.title] = train;
        }
      });

      Object.values(uniqueTrains).forEach(train => {
        $schedule.append(`
              <div class="schedule-item">
                  <div class="train-info">
                      <i class="fas fa-train"></i>
                      <span>${train.thread.title}</span>
                  </div>
                  <div class="train-time">${train.departure || '—'}</div>
              </div>
          `);
      });

      this.elements.scheduleView.append(`
          <h3 class="schedule-header">Расписание: ${title}</h3>
          ${$schedule.prop('outerHTML')}
      `);
    },

    setupEventListeners() {
      this.elements.searchInput
        .off('input')
        .on('input', () => this.handleSearch())
        .on('keypress', e => {
          if (e.which === 13) {
            e.preventDefault();
            this.handleSearch();
          }
        });

      $(document)
        .on('click', '.search-result-item', e => this.handleStationSelect(e))
        .on('click', '.add-favorite-btn', e => this.handleAddFavorite(e))
        .on('click', '.remove-favorite-btn', e => this.handleRemoveFavorite(e))
        .on('click', '.favorite-item', e => this.handleFavoriteSelect(e))
        .on('click', e => {
          if (!$(e.target).closest('.search-container').length) {
            this.clearSearchResults();
          }
        });

      this.elements.searchButton.on('click', e => {
        e.preventDefault();
        this.handleSearch();
      });

      this.elements.locateButton.on('click', () => this.initGeoLocation());
    },

    handleFavoriteSelect(e) {
      const $item = $(e.currentTarget);
      const code = $item.data('code');
      const title = $item.find('span').text();

      this.loadSchedule(title, code);
      this.clearSearch();
    },

    showFeedback(message) {
      const $feedback = $(`<div class="feedback-message">${message}</div>`);
      $('body').append($feedback);
      setTimeout(() => $feedback.remove(), 2000);
    },

    startClock() {
      setInterval(() => {
        this.elements.currentTime.text(
          new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        );
      }, 1000);
    },

    clearSearch() {
      this.elements.searchInput.val('');
      this.clearSearchResults();
    },

    clearSearchResults() {
      this.elements.searchResults.hide().empty();
    },

    showLoading() {
      this.elements.scheduleView.html(`
        <div class="loading-state">
          <div class="loader"></div>
          <p>Загрузка...</p>
        </div>
      `);
    },

    showError(message) {
      this.elements.scheduleView.html(`
        <div class="error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>${message}</p>
        </div>
      `);
    },

    showNoSchedule() {
      this.elements.scheduleView.html(`
        <div class="empty-state">
          <i class="fas fa-train"></i>
          <p>Нет данных о расписании</p>
        </div>
      `);
    }
  };

  App.init();
});