class RouteFinder {
  constructor() {
    this.apiEndpoint = '/api';
    this.allStations = [];
    this.initElements();
    this.bindEvents();
    this.initStations();
    this.fixContainerHeight();
  }

  fixContainerHeight() {
    const referenceHeight = $('.schedule-container').outerHeight() || 500;
    this.elements.scheduleView.css({
      'height': `${referenceHeight}px`,
      'min-height': `${referenceHeight}px`,
      'overflow-y': 'auto'
    });
  }

  initElements() {
    this.elements = {
      fromInput: $('#fromStation'),
      toInput: $('#toStation'),
      fromSuggestions: $('#fromSuggestions'),
      toSuggestions: $('#toSuggestions'),
      findButton: $('#findRoute'),
      scheduleView: $('#scheduleView')
    };
  }

  bindEvents() {
    this.elements.fromInput.on('input', () => this.handleInput(this.elements.fromInput, this.elements.fromSuggestions));
    this.elements.toInput.on('input', () => this.handleInput(this.elements.toInput, this.elements.toSuggestions));
    this.elements.fromSuggestions.on('click', '.suggestion-item', (e) => this.handleSuggestionClick(e));
    this.elements.toSuggestions.on('click', '.suggestion-item', (e) => this.handleSuggestionClick(e));
    this.elements.findButton.on('click', (e) => {
      e.preventDefault();
      this.findRoute();
    });
    $(document).on('click', (e) => this.closeSuggestions(e));
  }

  async initStations() {
    try {
      const response = await fetch(`${this.apiEndpoint}/allStations`);
      const data = await response.json();
      this.allStations = data.stations;
    } catch (error) {
      console.error('Ошибка загрузки станций:', error);
      this.showError('Не удалось загрузить список станций');
    }
  }

  handleInput($input, $suggestions) {
    const query = $input.val().trim();
    if (query.length < 2) {
      $suggestions.hide();
      return;
    }

    const suggestions = this.searchStations(query);
    this.showSuggestions($suggestions, suggestions);
  }

  searchStations(query) {
    const normalizedQuery = query.toLowerCase().trim();
    return this.allStations.filter(station =>
      station.title.toLowerCase().includes(normalizedQuery) &&
      station.transport_type === 'train'
    );
  }

  showSuggestions($container, stations) {
    $container.empty();

    if (stations.length === 0) {
      $container.hide();
      return;
    }

    const uniqueStationCodes = new Set();
    const uniqueStations = [];

    stations.forEach(station => {
      if (!uniqueStationCodes.has(station.code)) {
        uniqueStationCodes.add(station.code);
        uniqueStations.push(station);
      }
    });

    uniqueStations.forEach(station => {
      $container.append(`
            <div class="suggestion-item" data-code="${station.code}">
                ${station.title} <small>(${station.transport_type === 'suburban' ? 'электричка' : 'поезд'})</small>
            </div>
        `);
    });

    $container.show();
  }

  handleSuggestionClick(e) {
    const $item = $(e.currentTarget);
    const $suggestions = $item.parent();
    const $inputWrapper = $suggestions.closest('.input-wrapper');
    const $input = $inputWrapper.find('.search-input');

    $input.val($item.text().split(' (')[0].trim());
    $input.data('station-code', $item.data('code'));
    $suggestions.hide();
  }

  closeSuggestions(e) {
    if (!$(e.target).closest('.station-box').length) {
      $('.suggestions').hide();
    }
  }

  async findRoute() {
    const fromCode = this.elements.fromInput.data('station-code');
    const toCode = this.elements.toInput.data('station-code');

    if (!fromCode || !toCode) {
      this.showError('Пожалуйста, выберите станции из списка предложений');
      return;
    }

    try {
      this.showLoading();

      const response = await fetch(`${this.apiEndpoint}/searchRoutes?from=${fromCode}&to=${toCode}`);
      const data = await response.json();

      if (data.routes?.length > 0) {
        this.showRoutes(data.routes);
      } else {
        this.showNoRoutes();
      }
    } catch (error) {
      console.error('Ошибка при поиске маршрута:', error);
      this.showError('Произошла ошибка при загрузке маршрутов');
    }
  }

  showLoading() {
    this.elements.scheduleView.html(`
      <div style="height: 100%; display: flex; align-items: center; justify-content: center;">
        <div class="loader"></div>
      </div>
    `);
  }

  showError(message) {
    this.elements.scheduleView.html(`
      <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; text-align: center;">
        <i class="fas fa-exclamation-triangle" style="color: #dc3545; font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>${message}</p>
      </div>
    `);
  }

  showNoRoutes() {
    this.elements.scheduleView.html(`
      <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; text-align: center;">
        <i class="fas fa-exclamation-circle" style="color: #dc3545; font-size: 2rem; margin-bottom: 1rem;"></i>
        <h3 style="margin-bottom: 0.5rem;">Маршрутов не найдено</h3>
        <p>Попробуйте изменить параметры поиска</p>
      </div>
    `);
  }



  showRoutes(routes) {
    const $container = $(`
      <div style="height: 100%; display: flex; flex-direction: column;">
        <div style="flex-shrink: 0; padding: 1rem; border-bottom: 1px solid #eee;">
          <h3 style="margin: 0 0 0.5rem 0; font-size: 1.1rem;">
            <i class="fas fa-train"></i> Найденные маршруты
          </h3>
          <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
            <span style="font-weight: 500;">${this.elements.fromInput.val()}</span>
            <i class="fas fa-arrow-right"></i>
            <span style="font-weight: 500;">${this.elements.toInput.val()}</span>
          </div>
        </div>
        <div class="routes-list" style="flex: 1; overflow-y: auto;"></div>
      </div>
    `);

    const $routesList = $container.find('.routes-list');

    const uniqueRoutes = {};

    routes.forEach(route => {
      const routeKey = `${route.thread.title}-${route.thread.number}-${route.departure}-${route.arrival}`;
      if (!uniqueRoutes[routeKey]) {
        uniqueRoutes[routeKey] = route;
      }
    });

    Object.values(uniqueRoutes).forEach(route => {
      const duration = this.formatDuration(route.duration_seconds || route.duration);
      $routesList.append(this.createRouteItem(route, duration));
    });

    this.elements.scheduleView.empty().append($container);
  }

  createRouteItem(route, duration) {
    return $(`
      <div style="padding: 1rem; border-bottom: 1px solid #f5f5f5;">
        <div style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fas fa-subway" style="color: #4361ee;"></i>
          <strong style="font-size: 1rem;">${route.thread.title}</strong>
          ${route.thread.number ? `<span style="font-size: 0.8rem; color: #666;">№ ${route.thread.number}</span>` : ''}
        </div>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.9rem;">
          <div style="display: flex; align-items: center; gap: 0.25rem;">
            <i class="fas fa-clock" style="color: #666;"></i>
            <span>${route.departure || '—'}</span>
          </div>
          ${route.arrival ? `
          <div style="display: flex; align-items: center; gap: 0.25rem;">
            <i class="fas fa-flag-checkered" style="color: #666;"></i>
            <span>${route.arrival}</span>
          </div>` : ''}
          ${duration ? `
          <div style="display: flex; align-items: center; gap: 0.25rem;">
            <i class="fas fa-hourglass-half" style="color: #666;"></i>
            <span>${duration}</span>
          </div>` : ''}
        </div>
      </div>
    `);
  }

  formatDuration(seconds) {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} ч ${minutes} мин`;
  }
}

$(document).ready(() => {
  const routeFinder = new RouteFinder();
}); 