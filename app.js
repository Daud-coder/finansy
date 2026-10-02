/* «Финансы» — приложение к Google Таблице «Финансы».
   Данные берём у того же скрипта, что и кнопка iPhone (вход по коду из таблицы).
   Последние данные кэшируются на телефоне, чтобы смотреть без сети. */
(function () {
  'use strict';

  var API = 'https://script.google.com/macros/s/AKfycbyFTFBoiNfanYRpg4e2JCzpGUJjbpb1pqd5wYAT_7F7FJNWexC5vmNFsMBFEy9fu3vv/exec';
  var K_PIN = 'fin.pin', K_DATA = 'fin.data', K_TAB = 'fin.tab';
  var COLORS = ['#1B6B52', '#E0A43A', '#C84B31', '#3D7CC9', '#8E5BB5', '#2E9C9C', '#D9722B', '#6E8B3D', '#B8487A', '#5B6770', '#A3833A', '#4A5BC4'];
  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n, sign) {
    var r = Math.round(Math.abs(n));
    var s = r.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₴';
    if (sign && n > 0) return '+' + s;
    if (n < 0 && Math.round(n) !== 0) return '−' + s;
    return s;
  }
  function short(n) { return n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + 'к' : String(Math.round(n)); }
  function ym(d) { return d.slice(0, 7); }
  function parseYm(s) { var p = s.split('-'); return { y: +p[0], m: +p[1] - 1 }; }
  function shiftYm(s, k) { var p = parseYm(s); var d = new Date(p.y, p.m + k, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function daysIn(s) { var p = parseYm(s); return new Date(p.y, p.m + 1, 0).getDate(); }

  var state = { pin: store(K_PIN), data: store(K_DATA), month: null, tab: store(K_TAB) || 'overview', opsFilter: 'all', catOn: null, busy: false };
  var catColor = {};

  /* ---------- сеть ---------- */
  function api(action, extra) {
    var body = Object.assign({ app: 1, pin: state.pin, action: action }, extra || {});
    // text/plain — без preflight, Apps Script так принимает кросс-доменный POST
    return fetch(API, { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.auth === false) { logout(res.message); throw new Error(res.message); }
        return res;
      });
  }

  function refresh(quiet) {
    if (state.busy) return Promise.resolve();
    state.busy = true;
    if (!quiet) note('Обновляю…');
    return api('data').then(function (res) {
      if (!res.ok) throw new Error(res.message || 'Ошибка');
      state.data = res; store(K_DATA, res);
      if (!state.month) state.month = ym(res.today);
      paintColors(); render();
      note('Обновлено в ' + new Date().toTimeString().slice(0, 5));
    }).catch(function (e) {
      note(navigator.onLine ? 'Не удалось обновить' : 'Нет сети — показаны сохранённые данные');
      console.warn(e);
    }).then(function () { state.busy = false; });
  }
  function note(t) { $('#syncNote').textContent = t; }

  /* ---------- вход ---------- */
  function showLock(msg) {
    $('#app').hidden = true; $('#lock').hidden = false;
    $('#lockErr').textContent = msg || '';
    setTimeout(function () { $('#pinInput').focus(); }, 50);
  }
  function logout(msg) { state.pin = null; drop(K_PIN); drop(K_DATA); state.data = null; showLock(msg); }
  $('#lockForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var pin = $('#pinInput').value.trim();
    var btn = e.target.querySelector('button');
    btn.disabled = true; $('#lockErr').textContent = '';
    state.pin = pin;
    api('data').then(function (res) {
      if (!res.ok) throw new Error(res.message);
      store(K_PIN, pin); state.data = res; store(K_DATA, res);
      state.month = ym(res.today);
      $('#pinInput').value = '';
      start();
    }).catch(function (err) {
      $('#lockErr').textContent = err.message === 'Failed to fetch' ? 'Нет связи с сервером. Проверь интернет.' : err.message;
      state.pin = null;
    }).then(function () { btn.disabled = false; });
  });

  /* ---------- расчёты ---------- */
  function paintColors() {
    catColor = {};
    var i = 0;
    (state.data.cats || []).forEach(function (c) { if (c.type === 'expense' && !catColor[c.name]) catColor[c.name] = COLORS[i++ % COLORS.length]; });
  }
  function colorOf(cat, type) { return type === 'income' ? 'var(--inc)' : (catColor[cat] || '#5B6770'); }
  function opsOf(month) { return (state.data.ops || []).filter(function (o) { return ym(o.date) === month; }); }
  function sum(list, type) { return list.reduce(function (s, o) { return s + (o.type === type ? o.amount : 0); }, 0); }
  function isCurrent() { return state.month === ym(state.data.today); }
  function dayNo() { return +state.data.today.slice(8, 10); }

  /* ---------- отрисовка ---------- */
  function render() {
    if (!state.data) return;
    var p = parseYm(state.month);
    $('#monthTitle').textContent = MONTHS[p.m] + ' ' + p.y;
    $('#nextM').disabled = isCurrent();
    $$('.tabs button').forEach(function (b) { b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'); });
    $$('.view').forEach(function (v) { v.hidden = v.dataset.view !== state.tab; });
    if (state.tab === 'overview') renderOverview();
    if (state.tab === 'ops') renderOps();
    if (state.tab === 'budgets') renderBudgets();
    if (state.tab === 'more') renderMore();
  }

  function renderMore() {
    var d = state.data, debts = d.debts || [], goals = d.goals || [], rec = d.recurring || [];
    var owe = debts.filter(function (x) { return x.balance > 0; }).reduce(function (s, x) { return s + x.balance; }, 0);
    $('#debtSub').textContent = owe ? 'тебе должны ' + money(owe) : '';
    $('#debtList').innerHTML = debts.length ? debts.sort(function (a, b) { return b.balance - a.balance; }).map(function (x) {
      return '<li><b>' + esc(x.person) + '</b><span class="' + (x.balance > 0 ? 'pos' : 'neg') + '">' + money(Math.abs(x.balance)) + '</span><small>' + (x.balance > 0 ? 'должен тебе' : 'ты должен') + '</small></li>';
    }).join('') : '<li class="empty">Долгов нет — все в расчёте</li>';
    $('#goalList').innerHTML = goals.length ? goals.map(function (g) {
      var pct = g.target ? Math.min(100, g.saved / g.target * 100) : 0;
      return '<li><b>' + esc(g.name) + '</b><span>' + money(g.saved) + '</span>' +
        (g.target ? '<div class="track"><i style="width:' + pct + '%"></i></div><small>' + Math.round(pct) + '% из ' + money(g.target) + ' · осталось ' + money(Math.max(0, g.target - g.saved)) + '</small>' : '') + '</li>';
    }).join('') : '<li class="empty">Целей пока нет</li>';
    var recTotal = rec.filter(function (r) { return r.type === 'expense'; }).reduce(function (s, r) { return s + r.amount; }, 0);
    $('#recSub').textContent = recTotal ? money(recTotal) + ' в месяц' : '';
    $('#recList').innerHTML = rec.length ? rec.sort(function (a, b) { return a.day - b.day; }).map(function (r) {
      return '<li><b>' + esc(r.name) + '</b><span class="' + (r.type === 'income' ? 'pos' : '') + '">' + (r.amount ? (r.type === 'income' ? '+' : '') + money(r.amount) : 'по факту') + '</span><small>каждое ' + r.day + '-е · ' + esc(r.category) + '</small></li>';
    }).join('') : '<li class="empty">Регулярных платежей нет</li>';
    $('#connList').innerHTML =
      '<li><b>Telegram</b><span class="' + (d.telegram ? 'pos' : '') + '">' + (d.telegram ? 'подключён' : '—') + '</span><small>напоминания о платежах, итоги недели и месяца</small></li>' +
      '<li><b>Monobank</b><span class="' + (d.mono ? 'pos' : '') + '">' + (d.mono ? 'подключён' : '—') + '</span><small>оплаты картой записываются сами</small></li>';
  }

  function renderOverview() {
    var list = opsOf(state.month);
    var spent = sum(list, 'expense'), inc = sum(list, 'income');
    $('#spent').textContent = money(spent);
    $('#income').textContent = money(inc);
    var net = $('#net'); net.textContent = money(inc - spent, true);
    net.className = inc - spent > 0 ? 'pos' : inc - spent < 0 ? 'neg' : '';
    var days = isCurrent() ? dayNo() : daysIn(state.month);
    $('#perDay').textContent = money(spent / days);

    // сравнение с тем же периодом прошлого месяца
    var prev = shiftYm(state.month, -1);
    var prevList = opsOf(prev).filter(function (o) { return !isCurrent() || +o.date.slice(8, 10) <= dayNo(); });
    var prevSpent = sum(prevList, 'expense');
    var cmp = $('#cmp');
    if (prevSpent > 0 && spent > 0) {
      var pct = Math.round((spent - prevSpent) / prevSpent * 100);
      var pm = parseYm(prev).m;
      cmp.innerHTML = (pct === 0 ? 'Столько же, сколько' : '<b class="' + (pct > 0 ? 'up' : 'down') + '">на ' + Math.abs(pct) + '% ' + (pct > 0 ? 'больше' : 'меньше') + '</b>, чем') +
        (isCurrent() ? ' за те же дни ' + MONTHS_GEN[pm] : ' в ' + MONTHS[pm].replace(/ь$/, 'е').replace(/й$/, 'е').replace(/т$/, 'те'));
    } else cmp.textContent = list.length ? '' : 'В этом месяце записей нет';

    renderDonut(list, spent);
    renderBars(list);
    renderMonths();
  }

  function renderDonut(list, spent) {
    var by = {};
    list.forEach(function (o) { if (o.type === 'expense') by[o.category] = (by[o.category] || 0) + o.amount; });
    var cats = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
    var budgets = {};
    (state.data.cats || []).forEach(function (c) { if (c.type === 'expense') budgets[c.name] = c.budget; });
    var svg = $('#donut'), R = 46, C = 2 * Math.PI * R, off = 0, html = '';
    if (!cats.length) html = '<circle cx="60" cy="60" r="' + R + '" stroke="var(--card-2)"></circle>';
    cats.forEach(function (c) {
      var len = by[c] / spent * C, gap = cats.length > 1 ? 1.2 : 0;
      html += '<circle data-cat="' + esc(c) + '" cx="60" cy="60" r="' + R + '" stroke="' + colorOf(c) + '" stroke-dasharray="' + Math.max(0, len - gap) + ' ' + (C - Math.max(0, len - gap)) + '" stroke-dashoffset="' + (-off) + '"' + (state.catOn === c ? ' class="is-on"' : '') + '></circle>';
      off += len;
    });
    svg.innerHTML = html;
    var on = state.catOn && by[state.catOn] ? state.catOn : null;
    $('#donutCenter').innerHTML = on
      ? '<span>' + esc(on) + '</span><b>' + money(by[on]) + '</b><span>' + Math.round(by[on] / spent * 100) + '%</span>'
      : '<span>всего</span><b>' + money(spent) + '</b><span>' + cats.length + ' ' + plural(cats.length, 'категория', 'категории', 'категорий') + '</span>';
    $('#legend').innerHTML = cats.length ? cats.map(function (c) {
      var b = budgets[c], pct = b ? Math.min(100, by[c] / b * 100) : 0;
      return '<li data-cat="' + esc(c) + '"' + (on === c ? ' class="is-on"' : '') + '><i style="background:' + colorOf(c) + '"></i><span>' + esc(c) + '<small>' + Math.round(by[c] / spent * 100) + '%</small></span><b>' + money(by[c]) + '</b>' +
        (b ? '<div class="lb" title="Бюджет ' + money(b) + '"><i style="width:' + pct + '%;background:' + (by[c] > b ? 'var(--exp)' : pct > 80 ? 'var(--warn)' : colorOf(c)) + '"></i></div>' : '') + '</li>';
    }).join('') : '<li class="empty" style="display:block">Пока пусто — нажми «+» и запиши первую трату</li>';
  }

  function renderBars(list) {
    var n = daysIn(state.month), by = new Array(n + 1).fill(0);
    list.forEach(function (o) { if (o.type === 'expense') by[+o.date.slice(8, 10)] += o.amount; });
    var max = Math.max.apply(null, by.concat([1]));
    var today = isCurrent() ? dayNo() : 0;
    var upto = today || n, total = by.reduce(function (a, b) { return a + b; }, 0), avg = total / upto;
    var html = '';
    for (var d = 1; d <= n; d++) {
      var h = by[d] / max * 100;
      var label = (d === 1 || d % 5 === 0 || d === today) ? d : '';
      html += '<div class="bar' + (d === today ? ' is-today' : '') + '" data-d="' + d + '" data-v="' + by[d] + '"><i class="' + (by[d] ? '' : 'zero') + '" style="height:' + Math.max(h, by[d] ? 3 : 1.5) + '%"></i><small>' + label + '</small></div>';
    }
    html += avg > 0 ? '<div class="bars__avg" style="bottom:calc(17px + ' + (avg / max * (100 - 13)) + '%)"></div>' : '';
    $('#bars').innerHTML = html;
    $('#daysSub').textContent = avg > 0 ? 'в среднем ' + money(avg) + ' в день' : '';
  }

  function renderMonths() {
    var cur = ym(state.data.today), ms = [];
    for (var k = 5; k >= 0; k--) ms.push(shiftYm(cur, -k));
    var vals = ms.map(function (m) { return sum(opsOf(m), 'expense'); });
    var max = Math.max.apply(null, vals.concat([1]));
    $('#months').innerHTML = ms.map(function (m, i) {
      return '<button class="mcol' + (m === state.month ? ' is-on' : '') + '" data-m="' + m + '" aria-label="' + MONTHS[parseYm(m).m] + ': ' + money(vals[i]) + '"><b>' + (vals[i] ? short(vals[i]) : '') + '</b><i style="height:' + (vals[i] / max * 78) + '%"></i><small>' + MONTHS_SHORT[parseYm(m).m] + '</small></button>';
    }).join('');
  }

  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }

  function renderOps() {
    var list = opsOf(state.month).filter(function (o) { return state.opsFilter === 'all' || o.type === state.opsFilter; })
      .sort(function (a, b) { return b.date.localeCompare(a.date) || b.created - a.created; });
    if (!list.length) { $('#opsList').innerHTML = '<p class="empty">Нет записей за этот месяц</p>'; return; }
    var groups = {}, order = [];
    list.forEach(function (o) { if (!groups[o.date]) { groups[o.date] = []; order.push(o.date); } groups[o.date].push(o); });
    $('#opsList').innerHTML = order.map(function (d) {
      var dt = new Date(d + 'T12:00:00'), g = groups[d];
      var daySum = sum(g, 'expense');
      var title = d === state.data.today ? 'Сегодня' : d === yesterday() ? 'Вчера' : dt.getDate() + ' ' + MONTHS_GEN[dt.getMonth()] + ', ' + WD[dt.getDay()];
      return '<div class="day"><div class="day__h"><span>' + title + '</span><span>' + (daySum ? '−' + money(daySum) : '') + '</span></div><div class="day__list">' +
        g.map(function (o) {
          var idx = (state.data.ops || []).indexOf(o);
          return '<button class="op" data-i="' + idx + '"><span class="op__ic" style="background:' + colorOf(o.category, o.type) + '">' + esc(o.category.charAt(0)) + '</span>' +
            '<span class="op__t"><b>' + esc(o.comment || o.category) + '</b><span>' + esc(o.category) + ' · ' + esc(o.account) + '</span></span>' +
            '<span class="op__sum' + (o.type === 'income' ? ' inc' : '') + '">' + (o.type === 'income' ? '+' : '−') + money(o.amount) + '</span></button>';
        }).join('') + '</div></div>';
    }).join('');
  }
  function yesterday() { var d = new Date(state.data.today + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }

  function renderBudgets() {
    var list = opsOf(state.month), by = {};
    list.forEach(function (o) { if (o.type === 'expense') by[o.category] = (by[o.category] || 0) + o.amount; });
    var cats = (state.data.cats || []).filter(function (c) { return c.type === 'expense'; });
    var days = daysIn(state.month), passed = isCurrent() ? dayNo() : days;
    var withB = cats.filter(function (c) { return c.budget > 0; });
    var totB = withB.reduce(function (s, c) { return s + c.budget; }, 0);
    var totS = withB.reduce(function (s, c) { return s + (by[c.name] || 0); }, 0);
    $('#budgetTotal').innerHTML = totB
      ? '<p>Потрачено из бюджетов</p><b>' + money(totS) + ' из ' + money(totB) + '</b>' +
        '<div class="track" style="margin-top:10px"><i class="' + cls(totS, totB) + '" style="width:' + Math.min(100, totS / totB * 100) + '%"></i></div>' +
        '<p style="margin-top:8px">' + (totS <= totB ? 'Осталось ' + money(totB - totS) + (isCurrent() && days - passed > 0 ? ' — это ' + money((totB - totS) / (days - passed + 1)) + ' в день' : '') : 'Перерасход ' + money(totS - totB)) + '</p>'
      : '<p>Бюджеты не заданы</p><b>Задай лимиты по категориям</b><p style="margin-top:6px">и приложение покажет, сколько ещё можно тратить.</p>';
    cats.sort(function (a, b) { return (b.budget > 0) - (a.budget > 0) || (by[b.name] || 0) - (by[a.name] || 0); });
    $('#budgetList').innerHTML = cats.map(function (c) {
      var s = by[c.name] || 0, b = c.budget;
      var noteTxt = b ? (s > b ? 'Перерасход ' + money(s - b) : 'Осталось ' + money(b - s)) : 'Без лимита';
      return '<li><button class="brow" data-cat="' + esc(c.name) + '"><div class="brow__top"><b>' + esc(c.name) + '</b><span class="brow__nums"><strong>' + money(s) + '</strong>' + (b ? ' из ' + money(b) : '') + '</span></div>' +
        (b ? '<div class="track"><i class="' + cls(s, b) + '" style="width:' + Math.min(100, s / b * 100) + '%"></i></div>' : '') +
        '<span class="brow__note' + (b && s > b ? ' over' : '') + '">' + noteTxt + '</span></button></li>';
    }).join('');
  }
  function cls(s, b) { return s > b ? 'over' : s / b > 0.8 ? 'warn' : ''; }

  /* ---------- листы снизу ---------- */
  var openSheet = null;
  function sheet(id) {
    closeSheet(true);
    openSheet = $(id); $('#sheetBg').hidden = false; openSheet.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { $('#sheetBg').classList.add('on'); openSheet.classList.add('on'); }); });
  }
  function closeSheet(instant) {
    if (!openSheet) return;
    var s = openSheet; openSheet = null;
    s.classList.remove('on'); $('#sheetBg').classList.remove('on');
    setTimeout(function () { if (!openSheet) { s.hidden = true; $('#sheetBg').hidden = true; } }, instant ? 0 : 320);
  }
  $('#sheetBg').addEventListener('click', function () { closeSheet(); });
  document.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  function toast(t) { var el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 2600); }

  // добавление
  var CHIPS = ['Кофе ', 'Продукты ', 'Такси ', 'Обед ', 'Бензин '];
  $('#chips').innerHTML = CHIPS.map(function (c) { return '<button type="button">' + c.trim() + '</button>'; }).join('');
  $('#chips').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var t = $('#addText'); t.value = (t.value.trim() ? t.value.trim() + ' и ' : '') + b.textContent + ' '; t.focus();
  });
  $('#fab').addEventListener('click', function () {
    $('#addRes').textContent = ''; $('#addRes').className = 'sheet__res'; sheet('#addSheet');
    setTimeout(function () { $('#addText').focus(); }, 350);
  });
  $('#addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = $('#addText').value.trim(); if (!text) return;
    var btn = $('#addBtn'), res = $('#addRes');
    btn.disabled = true; btn.textContent = 'Записываю…'; res.textContent = ''; res.className = 'sheet__res';
    api('add', { text: text }).then(function (r) {
      res.textContent = r.message || (r.ok ? 'Готово' : 'Не получилось');
      res.className = 'sheet__res ' + (r.ok ? 'ok' : 'err');
      if (r.ok && r.kind !== 'query') { $('#addText').value = ''; if (r.kind === 'add') state.month = ym(state.data.today); refresh(true); setTimeout(closeSheet, r.message && r.message.length > 60 ? 3200 : 1600); }
    }).catch(function (err) { res.textContent = 'Нет связи: ' + err.message; res.className = 'sheet__res err'; })
      .then(function () { btn.disabled = false; btn.textContent = 'Записать'; });
  });

  // фото чека: уменьшаем до 1600px, чтобы быстро ушло и нейросеть прочла
  function shrink(file) {
    return new Promise(function (ok, fail) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error('Не удалось открыть фото')); };
      img.src = url;
    });
  }
  $('#receiptInput').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    var btn = $('#receiptBtn'), label = btn.querySelector('span'), res = $('#addRes');
    btn.classList.add('is-busy'); label.textContent = 'Читаю чек…'; res.textContent = ''; res.className = 'sheet__res';
    shrink(file).then(function (b64) { return api('receipt', { image: b64 }); }).then(function (r) {
      res.textContent = r.message || (r.ok ? 'Готово' : 'Не получилось');
      res.className = 'sheet__res ' + (r.ok ? 'ok' : 'err');
      if (r.ok) { state.month = ym(state.data.today); refresh(true); }
    }).catch(function (err) { res.textContent = err.message; res.className = 'sheet__res err'; })
      .then(function () { btn.classList.remove('is-busy'); label.textContent = 'Фото чека'; });
  });

  // бюджет
  var bCat = null;
  $('#budgetList').addEventListener('click', function (e) {
    var b = e.target.closest('.brow'); if (!b) return;
    bCat = b.dataset.cat;
    var c = state.data.cats.filter(function (x) { return x.name === bCat && x.type === 'expense'; })[0];
    $('#bTitle').textContent = bCat;
    $('#bHint').textContent = 'Сколько готов тратить на «' + bCat + '» в месяц. 0 — убрать лимит.';
    $('#bAmount').value = c && c.budget ? c.budget : '';
    $('#bRes').textContent = '';
    sheet('#budgetSheet'); setTimeout(function () { $('#bAmount').focus(); }, 350);
  });
  $('#budgetForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var amount = Math.max(0, Number($('#bAmount').value) || 0), btn = e.target.querySelector('button');
    btn.disabled = true;
    api('budget', { category: bCat, amount: amount }).then(function (r) {
      if (!r.ok) throw new Error(r.message);
      state.data.cats.forEach(function (c) { if (c.name === bCat && c.type === 'expense') c.budget = amount; });
      store(K_DATA, state.data); render(); closeSheet(); toast(r.message);
    }).catch(function (err) { $('#bRes').textContent = err.message; $('#bRes').className = 'sheet__res err'; })
      .then(function () { btn.disabled = false; });
  });

  // удаление
  var delOp = null;
  $('#opsList').addEventListener('click', function (e) {
    var b = e.target.closest('.op'); if (!b) return;
    delOp = state.data.ops[+b.dataset.i]; if (!delOp) return;
    var same = state.data.ops.filter(function (o) { return o.id === delOp.id; });
    $('#opInfo').innerHTML = '<b>' + (delOp.type === 'income' ? '+' : '−') + money(delOp.amount) + ' · ' + esc(delOp.category) + '</b>' +
      '<span>' + esc(delOp.comment || '') + '</span><small>' + delOp.date.split('-').reverse().join('.') + ' · ' + esc(delOp.account) + '</small>' +
      (same.length > 1 ? '<small>Записана одной фразой вместе с ещё ' + (same.length - 1) + ' — удалятся все ' + same.length + '.</small>' : '');
    $('#oRes').textContent = ''; $('#delBtn').disabled = false; $('#delBtn').textContent = 'Удалить';
    sheet('#opSheet');
  });
  $('#delBtn').addEventListener('click', function () {
    if (!delOp) return;
    var btn = this; btn.disabled = true; btn.textContent = 'Удаляю…';
    api('undo', { id: delOp.id }).then(function (r) {
      if (!r.ok) throw new Error(r.message);
      var id = delOp.id;
      state.data.ops = state.data.ops.filter(function (o) { return o.id !== id; });
      store(K_DATA, state.data); render(); closeSheet(); toast('Удалено');
    }).catch(function (err) { $('#oRes').textContent = err.message; $('#oRes').className = 'sheet__res err'; btn.disabled = false; btn.textContent = 'Удалить'; });
  });

  /* ---------- навигация ---------- */
  $$('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { state.tab = b.dataset.tab; store(K_TAB, state.tab); window.scrollTo(0, 0); render(); });
  });
  $('#prevM').addEventListener('click', function () { state.month = shiftYm(state.month, -1); state.catOn = null; render(); });
  $('#nextM').addEventListener('click', function () { if (!isCurrent()) { state.month = shiftYm(state.month, 1); state.catOn = null; render(); } });
  $('#opsFilter').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.opsFilter = b.dataset.f;
    $$('#opsFilter button').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
    renderOps();
  });
  function toggleCat(c) { state.catOn = state.catOn === c ? null : c; renderOverview(); }
  $('#donut').addEventListener('click', function (e) { var c = e.target.closest('circle'); if (c && c.dataset.cat) toggleCat(c.dataset.cat); });
  $('#legend').addEventListener('click', function (e) { var li = e.target.closest('li[data-cat]'); if (li) toggleCat(li.dataset.cat); });
  $('#bars').addEventListener('click', function (e) {
    var b = e.target.closest('.bar'); if (!b) return;
    $$('#bars .tip').forEach(function (t) { t.remove(); });
    var tip = document.createElement('span'); tip.className = 'tip';
    tip.textContent = b.dataset.d + ': ' + money(+b.dataset.v); b.appendChild(tip);
    setTimeout(function () { tip.remove(); }, 2200);
  });
  $('#months').addEventListener('click', function (e) { var b = e.target.closest('.mcol'); if (b) { state.month = b.dataset.m; state.catOn = null; render(); } });

  document.addEventListener('visibilitychange', function () { if (!document.hidden && state.pin) refresh(true); });
  window.addEventListener('online', function () { if (state.pin) refresh(true); });

  /* ---------- старт ---------- */
  function start() {
    $('#lock').hidden = true; $('#app').hidden = false;
    if (state.data) { if (!state.month) state.month = ym(state.data.today); paintColors(); render(); }
    refresh(!!state.data);
  }
  if (state.pin) start(); else showLock();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
