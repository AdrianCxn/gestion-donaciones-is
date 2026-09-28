const page = document.body.dataset.page;

function initializeLandingAnimations() {
    const revealElements = document.querySelectorAll('.landing-section-heading, .process-line, .process-grid .info-block, .audience-block, .help-copy, .contact-form');
    if (!('IntersectionObserver' in window)) {
        revealElements.forEach((element) => element.classList.add('scroll-visible'));
        return;
    }

    const observer = new IntersectionObserver((entries, currentObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('scroll-visible');
            currentObserver.unobserve(entry.target);
        });
    }, { threshold: 0.15 });

    revealElements.forEach((element) => observer.observe(element));
}

function animateMetric(element, target) {
    const duration = 700;
    const start = performance.now();
    const update = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        element.textContent = Math.floor(progress * target);
        if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

const navigation = {
    home: `<header class="navbar"><div class="nav-left"><a href="/" class="logo-brand"><img src="/assets/img/horizontal_logo_givera.png" alt="GIVERA Logo" class="brand-logo-img"></a><nav class="nav-links"><a href="#donantes">Donantes</a><a href="#organizaciones">Organizaciones</a><a href="#centros-de-acopio">Centros de acopio</a></nav></div><div class="nav-right"><a href="#ayuda" class="nav-link-simple">Ayuda</a><a href="/login.html" class="btn btn-light">Iniciar sesión</a><a href="/registro.html" class="btn btn-dark">Registrarse</a></div></header>`,
    login: `<header class="navbar"><a href="/" class="logo-brand"><img src="/assets/img/horizontal_logo_givera.png" alt="GIVERA Logo" class="brand-logo-img"></a><div class="nav-right"><a href="/registro.html" class="btn btn-dark">Registrarse</a></div></header>`,
    register: `<header class="navbar"><a href="/" class="logo-brand"><img src="/assets/img/horizontal_logo_givera.png" alt="GIVERA Logo" class="brand-logo-img"></a><div class="nav-right"><a href="/login.html" class="btn btn-light">Iniciar sesión</a></div></header>`,
    dashboard: `<header class="navbar"><div class="nav-left"><span class="logo-brand"><img src="/assets/img/horizontal_logo_givera.png" alt="GIVERA Logo" class="brand-logo-img"></span><span id="user-badge" class="badge">Usuario</span></div><div class="nav-right"><button id="logout-btn" class="btn btn-light">Cerrar sesión</button></div></header>`,
    'donation-detail': `<header class="navbar"><div class="nav-left"><span class="logo-brand"><img src="/assets/img/horizontal_logo_givera.png" alt="GIVERA Logo" class="brand-logo-img"></span><span id="user-badge" class="badge">Usuario</span></div><div class="nav-right"><button id="logout-btn" class="btn btn-light">Cerrar Sesión</button></div></header>`
};

document.querySelector('[data-component="navbar"]').outerHTML = navigation[page] || navigation.home;

const message = (id, text) => {
    const element = document.getElementById(id);
    element.textContent = text;
    element.classList.remove('hidden');
};

async function login(event) {
    event.preventDefault();
    document.getElementById('error-msg').classList.add('hidden');
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al autenticar');
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
        localStorage.setItem('username', data.username);
        window.location.href = '/dashboard.html';
    } catch (error) {
        message('error-msg', error.message);
    }
}

async function register(event) {
    event.preventDefault();
    document.getElementById('error-msg').classList.add('hidden');
    document.getElementById('success-msg').classList.add('hidden');
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('reg-username').value,
                password: document.getElementById('reg-password').value,
                role: document.getElementById('reg-role').value
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al registrar');
        message('success-msg', 'Registro exitoso. Redirigiendo al inicio de sesión...');
        setTimeout(() => { window.location.href = '/login.html'; }, 1500);
    } catch (error) {
        message('error-msg', error.message);
    }
}

async function initializeRegistrationAvailability() {
    const form = document.getElementById('register-form');
    const pausedMessage = document.getElementById('registration-paused');
    try {
        const response = await fetch('/api/settings/registration');
        const data = await response.json();
        if (response.ok && !data.registrationOpen) {
            form.classList.add('registration-disabled');
            form.querySelectorAll('input, select, button').forEach((control) => { control.disabled = true; });
            pausedMessage.classList.remove('hidden');
        }
    } catch (error) {
        pausedMessage.textContent = 'No se pudo comprobar la disponibilidad del registro.';
        pausedMessage.classList.remove('hidden');
    }
}

async function dashboard() {
    const token = localStorage.getItem('token');
    const role = (localStorage.getItem('role') || '').toLowerCase();
    const username = localStorage.getItem('username');
    if (!token) return window.location.replace('/login.html');
    document.getElementById('user-badge').textContent = `${username} - ${role.charAt(0).toUpperCase() + role.slice(1)}`;
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.clear();
        window.location.replace('/login.html');
    });

    const isAdmin = role === 'admin' || role === 'administrador';
    const isDonor = role === 'donante';
    const isOrganization = role === 'organizacion';
    const donationsContainer = document.getElementById('donations-container');
    const feedback = document.getElementById('dashboard-feedback');
    let donations = [];

    document.getElementById('donor-section').classList.toggle('hidden', !isDonor && !isAdmin);
    document.getElementById('organization-filters').classList.toggle('hidden', !isOrganization);
    document.getElementById('catalog-title').textContent = isAdmin ? 'Todas las donaciones' : isDonor ? 'Mis donaciones' : 'Donaciones activas';
    document.getElementById('catalog-description').textContent = isAdmin ? 'Supervisa el estado de los recursos publicados en GIVERA.' : isDonor ? 'Revisa el estado de los recursos que has publicado.' : 'Consulta los recursos disponibles para tu organización.';
    if (isAdmin) {
        document.getElementById('donor-eyebrow').textContent = 'GESTIÓN DE RECURSOS';
        document.getElementById('donor-section-title').textContent = 'Administrar donaciones';
        document.getElementById('donor-section-description').textContent = 'Publica y supervisa recursos para mantener actualizado el catálogo.';
    }

    const statusClass = (status) => status.toLowerCase().replace(' ', '-');
    const renderDonations = () => {
        const category = document.getElementById('filter-category')?.value || '';
        const status = document.getElementById('filter-status')?.value || '';
        const visibleDonations = donations.filter((donation) => (!category || donation.category === category) && (!status || donation.status === status));
        document.getElementById('empty-donations').classList.toggle('hidden', visibleDonations.length > 0);
        const cards = visibleDonations.map((donation) => {
            const card = document.createElement('a');
            card.className = 'donation-item-card';
            card.href = `/donations/${donation.id}`;

            const topline = document.createElement('div');
            topline.className = 'card-topline';
            const category = document.createElement('span');
            category.className = 'donation-category';
            category.textContent = donation.category;
            const status = document.createElement('span');
            status.className = `status-badge status-${statusClass(donation.status)}`;
            status.textContent = donation.status;
            topline.append(category, status);

            const title = document.createElement('h3');
            title.textContent = donation.title;
            const summary = document.createElement('p');
            const quantity = document.createElement('strong');
            quantity.textContent = donation.quantity;
            summary.append(quantity, document.createTextNode(` · ${donation.location}`));
            const detailLink = document.createElement('span');
            detailLink.className = 'card-link';
            detailLink.append(document.createTextNode('Ver detalle '));
            const arrow = document.createElement('span');
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = '→';
            detailLink.appendChild(arrow);
            card.append(topline, title, summary, detailLink);
            return card;
        });
        donationsContainer.replaceChildren(...cards);
    };

    const showDashboardMessage = (text, isError = false) => {
        feedback.textContent = text;
        feedback.classList.toggle('feedback-error', isError);
        setTimeout(() => { feedback.textContent = ''; }, 3500);
    };

    const loadDonations = async () => {
        const response = await fetch('/api/donations', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Sesión inválida');
        ({ donations } = await response.json());
        renderDonations();
    };

    document.getElementById('filter-category')?.addEventListener('change', renderDonations);
    document.getElementById('filter-status')?.addEventListener('change', renderDonations);
    document.getElementById('donation-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const submitButton = form.querySelector('button[type="submit"]');
        if (!form.checkValidity() || submitButton.disabled) return form.reportValidity();

        const formData = new FormData(form);
        const payload = Object.fromEntries(formData);
        payload.quantity = Number(payload.quantity);
        submitButton.disabled = true;
        submitButton.textContent = 'Publicando...';
        try {
            const response = await fetch('/api/donations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
            const data = await response.json();
            if (!response.ok) return showDashboardMessage(data.error || 'No se pudo publicar la donación.', true);

            donations.unshift(data.donation);
            renderDonations();
            form.reset();
            showDashboardMessage('Donación publicada correctamente.');
            const activeMetric = document.getElementById('metric-active-donations');
            const totalMetric = document.getElementById('metric-donations');
            if (activeMetric) activeMetric.textContent = Number(activeMetric.textContent || 0) + 1;
            if (totalMetric) totalMetric.textContent = Number(totalMetric.textContent || 0) + 1;
        } catch (error) {
            showDashboardMessage('No se pudo publicar la donación. Intenta de nuevo.', true);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Publicar donación';
        }
    });

    try {
        await loadDonations();
        if (isAdmin) {
            const metricsResponse = await fetch('/api/admin/metrics', { headers: { Authorization: `Bearer ${token}` } });
            if (metricsResponse.ok) {
                const metrics = await metricsResponse.json();
                document.getElementById('admin-section').classList.remove('hidden');
                animateMetric(document.getElementById('metric-users'), metrics.totalUsers);
                animateMetric(document.getElementById('metric-donations'), metrics.totalDonations);
                animateMetric(document.getElementById('metric-active-donations'), metrics.activeDonations);
                const registrationToggle = document.getElementById('registration-toggle');
                const registrationStatus = document.getElementById('registration-setting-status');
                registrationToggle.checked = metrics.registrationOpen;
                registrationStatus.textContent = metrics.registrationOpen ? 'Disponible' : 'Pausado para la presentación';
                registrationToggle.addEventListener('change', async () => {
                    registrationToggle.disabled = true;
                    const response = await fetch('/api/admin/settings/registration', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ registrationOpen: registrationToggle.checked })
                    });
                    if (!response.ok) registrationToggle.checked = !registrationToggle.checked;
                    registrationStatus.textContent = registrationToggle.checked ? 'Disponible' : 'Pausado para la presentación';
                    registrationToggle.disabled = false;
                });
            }
        }
    } catch (error) {
        localStorage.clear();
        window.location.replace('/login.html');
    }
}

async function donationDetail() {
    const token = localStorage.getItem('token');
    const role = (localStorage.getItem('role') || '').toLowerCase();
    const username = localStorage.getItem('username');
    if (!token) return window.location.replace('/login.html');

    document.getElementById('user-badge').textContent = `${username} (${role.toUpperCase()})`;
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.clear();
        window.location.replace('/login.html');
    });

    const statusClass = (status) => status.toLowerCase().replace(' ', '-');
    const donationId = window.location.pathname.split('/').pop();
    const loading = document.getElementById('detail-loading');
    const detail = document.getElementById('donation-detail');
    const error = document.getElementById('detail-error');

    try {
        const response = await fetch(`/api/donations/${donationId}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar la donación.');
        const donation = data.donation;

        document.getElementById('detail-title').textContent = donation.title;
        const status = document.getElementById('detail-status');
        status.textContent = donation.status;
        status.classList.add(`status-${statusClass(donation.status)}`);
        const detailContent = document.getElementById('detail-content');
        const detailFields = [['Donante', donation.donor], ['Categoría', donation.category], ['Cantidad', donation.quantity], ['Ubicación', donation.location]];
        detailContent.replaceChildren(...detailFields.map(([label, value]) => {
            const field = document.createElement('div');
            const fieldLabel = document.createElement('span');
            fieldLabel.textContent = label;
            const fieldValue = document.createElement('strong');
            fieldValue.textContent = value;
            field.append(fieldLabel, fieldValue);
            return field;
        }));

        const historyItems = donation.history.map((historyEvent) => {
            const item = document.createElement('li');
            const historyStatus = document.createElement('span');
            historyStatus.className = `status-badge status-${statusClass(historyEvent.status)}`;
            historyStatus.textContent = historyEvent.status;
            const historyDetails = document.createElement('span');
            historyDetails.textContent = `${new Date(historyEvent.changedAt).toLocaleString('es-MX')} · ${historyEvent.changedBy}`;
            item.append(historyStatus, historyDetails);
            return item;
        });
        document.getElementById('detail-history').replaceChildren(...historyItems);

        const nextStatus = role === 'organizacion' && donation.status === 'Disponible' ? 'En proceso' : role === 'organizacion' && donation.status === 'En proceso' ? 'Completada' : '';
        if (nextStatus) {
            const action = document.createElement('button');
            action.className = 'btn btn-primary';
            action.textContent = nextStatus === 'En proceso' ? 'Solicitar donación' : 'Confirmar recepción';
            action.addEventListener('click', async () => {
                action.disabled = true;
                const updateResponse = await fetch(`/api/donations/${donation.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: nextStatus }) });
                if (updateResponse.ok) window.location.reload();
                else action.disabled = false;
            });
            document.getElementById('detail-actions').appendChild(action);
        }

        loading.classList.add('hidden');
        detail.classList.remove('hidden');
    } catch (requestError) {
        loading.classList.add('hidden');
        error.textContent = requestError.message;
        error.classList.remove('hidden');
    }
}

document.getElementById('login-form')?.addEventListener('submit', login);
document.getElementById('register-form')?.addEventListener('submit', register);
document.getElementById('contact-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const feedback = document.getElementById('contact-feedback');
    if (!form.checkValidity()) return form.reportValidity();
    button.disabled = true;
    button.textContent = 'Enviando...';
    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo enviar el mensaje.');
        form.reset();
        feedback.textContent = data.message;
        feedback.classList.remove('feedback-error');
    } catch (error) {
        feedback.textContent = error.message;
        feedback.classList.add('feedback-error');
    } finally {
        button.disabled = false;
        button.textContent = 'Enviar mensaje';
    }
});
if (page === 'dashboard') dashboard();
if (page === 'donation-detail') donationDetail();
if (page === 'home') initializeLandingAnimations();
if (page === 'register') initializeRegistrationAvailability();
