(() => {
  const cfg = window.BARBEARIA_CONFIG || {};
  const fb = window.FB_CONFIG || {};
  const $ = id => document.getElementById(id);

  if (!window.firebase || !fb.apiKey || !fb.projectId) {
    console.error('Firebase não configurado.');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(fb);
  }

  const db = firebase.firestore();

  let servicos = [];
  let barbeiros = [];

  const hoje = () =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

  const moeda = valor =>
    Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

  const telefoneLimpo = valor =>
    String(valor || '')
      .replace(/\D/g, '')
      .replace(/^55(?=\d{10,11}$)/, '');

  const formatarTelefone = valor => {
    const n = telefoneLimpo(valor).slice(0, 11);

    if (n.length <= 2) return n;
    if (n.length <= 7) {
      return `(${n.slice(0, 2)}) ${n.slice(2, 3)} ${n.slice(3)}`;
    }

    return `(${n.slice(0, 2)}) ${n.slice(2, 3)} ${n.slice(3, 7)} ${n.slice(7)}`;
  };

  const minutos = hora => {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
  };

  const horaTexto = total => {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  function mostrarMensagem(texto, tipo = 'ok') {
    const el = $('mensagem');
    if (!el) return;

    el.textContent = texto;
    el.className = `mensagem ${tipo}`;
  }

  async function carregarConfiguracoes() {
    try {
      const ref = await db.collection('configuracoes').doc('geral').get();

      if (!ref.exists) return;

      const dados = ref.data();

      if (dados.nome) cfg.nome = dados.nome;
      if (dados.cidade) cfg.cidade = dados.cidade;
      if (dados.endereco) cfg.endereco = dados.endereco;
      if (dados.whatsapp) cfg.whatsapp = dados.whatsapp;
      if (dados.inicio) cfg.inicio = dados.inicio;
      if (dados.fim) cfg.fim = dados.fim;
      if (dados.intervalo) cfg.intervalo = Number(dados.intervalo);
    } catch (erro) {
      console.warn('Não foi possível carregar configurações', erro);
    }
  }

  async function carregarServicos() {
    const snap = await db
      .collection('servicos')
      .where('ativo', '==', true)
      .get();

    servicos = snap.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));

    if (!servicos.length) {
      servicos = (cfg.servicosPadrao || []).map(item => ({
        id: item.id,
        nome: item.nome,
        duracao_minutos: item.duracao,
        valor: item.valor
      }));
    }

    $('servicoSelect').innerHTML = servicos
      .map(
        item =>
          `<option value="${item.id}">
            ${item.nome} • ${item.duracao_minutos} min • ${moeda(item.valor)}
          </option>`
      )
      .join('');
  }

  async function carregarBarbeiros() {
    const snap = await db
      .collection('barbeiros')
      .where('ativo', '==', true)
      .get();

    barbeiros = snap.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));

    if (!barbeiros.length) {
      barbeiros = cfg.barbeirosPadrao || [];
    }

    $('barbeiroSelect').innerHTML = barbeiros
      .map(item => `<option value="${item.id}">${item.nome}</option>`)
      .join('');
  }

  async function carregarCatalogo() {
    try {
      await Promise.all([
        carregarServicos(),
        carregarBarbeiros()
      ]);
    } catch (erro) {
      console.error('Erro ao carregar catálogo', erro);
      mostrarMensagem(
        'Não foi possível carregar os dados da barbearia agora.',
        'erro'
      );
    }
  }

  async function horariosOcupados() {
    const data = $('dataAgendamento')?.value;
    const barbeiro = $('barbeiroSelect')?.value;

    if (!data || !barbeiro) {
      return new Set();
    }

    try {
      const snap = await db
        .collection('agendamentos')
        .where('data', '==', data)
        .where('barbeiro_id', '==', barbeiro)
        .get();

      const ocupados = snap.docs
        .map(doc => doc.data())
        .filter(item =>
          ['pendente', 'confirmado', 'em_atendimento'].includes(item.status)
        )
        .map(item => String(item.hora).slice(0, 5));

      return new Set(ocupados);
    } catch (erro) {
      console.warn('Erro ao consultar horários ocupados', erro);
      return new Set();
    }
  }

  async function gerarHorarios() {
    const select = $('horaSolicitada');

    if (!select) return;

    const ocupados = await horariosOcupados();

    const inicio = minutos(cfg.inicio || '08:30');
    const fim = minutos(cfg.fim || '20:00');
    const intervalo = Number(cfg.intervalo || 30);

    const dataSelecionada = $('dataAgendamento').value;
    const agora = new Date();

    const horarios = [];

    for (let m = inicio; m <= fim; m += intervalo) {
      const horario = horaTexto(m);

      if (ocupados.has(horario)) continue;

      if (dataSelecionada === hoje()) {
        const [h, min] = horario.split(':').map(Number);

        const alvo = new Date();
        alvo.setHours(h, min, 0, 0);

        if (alvo.getTime() < agora.getTime() + 20 * 60 * 1000) {
          continue;
        }
      }

      horarios.push(horario);
    }

    select.innerHTML = horarios.length
      ? horarios
          .map(h => `<option value="${h}">${h}</option>`)
          .join('')
      : '<option value="">Sem horários disponíveis</option>';
  }

  function mensagemWhatsApp(dados) {
    const servico = servicos.find(
      item => String(item.id) === String(dados.servico)
    );

    const barbeiro = barbeiros.find(
      item => String(item.id) === String(dados.barbeiro)
    );

    return [
      `Olá! Gostaria de agendar na ${cfg.nome}.`,
      '',
      `Cliente: ${dados.nome}`,
      `WhatsApp: ${dados.telefone}`,
      `Serviço: ${servico?.nome || dados.servico}`,
      `Barbeiro: ${barbeiro?.nome || dados.barbeiro}`,
      `Data: ${dados.data.split('-').reverse().join('/')}`,
      `Horário: ${dados.hora}`,
      dados.obs ? `Observação: ${dados.obs}` : '',
      '',
      'Pode confirmar este horário para mim?'
    ]
      .filter(Boolean)
      .join('\n');
  }

  function abrirWhatsApp(texto) {
    const numero = String(cfg.whatsapp || '').replace(/\D/g, '');

    if (!numero) return;

    window.open(
      `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,
      '_blank',
      'noopener'
    );
  }

  async function salvarAgendamento(dados) {
    const servico = servicos.find(
      item => String(item.id) === String(dados.servico)
    );

    await db.collection('agendamentos').add({
      nome: dados.nome,
      telefone: telefoneLimpo(dados.telefone),
      servico_id: dados.servico,
      barbeiro_id: dados.barbeiro,
      data: dados.data,
      hora: dados.hora,
      observacao: dados.obs || '',
      status: 'pendente',
      criado_em: firebase.firestore.FieldValue.serverTimestamp(),
      valor: Number(servico?.valor || 0)
    });
  }

  async function enviarAgendamento(evento) {
    evento.preventDefault();

    const btn = $('btnAgendar');

    const dados = {
      nome: $('clienteNome').value.trim(),
      telefone: $('clienteTelefone').value.trim(),
      servico: $('servicoSelect').value,
      barbeiro: $('barbeiroSelect').value,
      data: $('dataAgendamento').value,
      hora: $('horaSolicitada').value,
      obs: $('observacao').value.trim()
    };

    if (
      !dados.nome ||
      telefoneLimpo(dados.telefone).length < 10 ||
      !dados.servico ||
      !dados.barbeiro ||
      !dados.data ||
      !dados.hora
    ) {
      mostrarMensagem(
        'Confira todos os dados antes de continuar.',
        'erro'
      );
      return;
    }

    const textoOriginal = btn.innerHTML;

    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
      await salvarAgendamento(dados);

      mostrarMensagem(
        'Agendamento enviado com sucesso. A barbearia fará a confirmação.',
        'ok'
      );

      abrirWhatsApp(mensagemWhatsApp(dados));

      await gerarHorarios();
    } catch (erro) {
      console.error('Erro ao registrar agendamento', erro);

      mostrarMensagem(
        'Não foi possível registrar o agendamento agora.',
        'erro'
      );
    } finally {
      btn.disabled = false;
      btn.innerHTML = textoOriginal;
    }
  }

  function prepararTela() {
    const data = $('dataAgendamento');

    if (data) {
      data.min = hoje();
      data.value = hoje();
    }

    $('textoEndereco').textContent = cfg.endereco || '';
    $('footerEndereco').textContent = cfg.endereco || '';

    $('linkWhatsappTopo').href =
      `https://wa.me/${String(cfg.whatsapp || '').replace(/\D/g, '')}`;

    $('linkRota').href =
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        cfg.endereco || cfg.nome || ''
      )}`;

    $('clienteTelefone').addEventListener('input', evento => {
      evento.target.value = formatarTelefone(evento.target.value);
    });

    $('dataAgendamento').addEventListener('change', gerarHorarios);
    $('barbeiroSelect').addEventListener('change', gerarHorarios);

    $('formAgendamento').addEventListener(
      'submit',
      enviarAgendamento
    );

    $('statusSistema').textContent = 'Sistema conectado';
    $('statusDetalhe').textContent =
      'Serviços, profissionais e agenda conectados ao Firebase.';
  }

  window.addEventListener('DOMContentLoaded', async () => {
    prepararTela();

    await carregarConfiguracoes();
    await carregarCatalogo();
    await gerarHorarios();
  });
})();
