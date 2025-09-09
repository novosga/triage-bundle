/**
 * Novo SGA - Triage
 * @author Rogerio Lino <rogeriolino@gmail.com>
 */
(function () {
    'use strict'

    var Impressao = {
        iframe: 'frame-impressao',
        url(atendimento) {
            return App.url('/novosga.triage/imprimir/') + atendimento.id +'?_' + (new Date()).getTime();
        },
        imprimir(atendimento) {
            var iframe = document.getElementById(this.iframe);
            if (iframe) {
                iframe.src = this.url(atendimento);
                iframe.onload = function () {
                    iframe.contentWindow.print();
                };
            }
        }
    };

    new Vue({
        el: '#triagem',
        data: {
            servicoIds: [],
            timeoutId: null,
            servicos: (servicos || []),
            prioridades: (prioridades || []),
            unidade: (unidade || {}),
            cliente: {
                id: null,
                nome: '',
                documento: ''
            },
            ultimaSenha: null,
            servicoInfo: null,
            atendimento: null,
            pausado: false,
            totais: {},
            servico: 0,
            prioridade: 0,
            search: '',
            searchResult: [],
            config: {
                imprimir: true,
                exibir: true,
                desabilitados: [],
            },
            fetchingClientes: false,
            clientes: [],
            agendamentos: [],
            servicoAgendamento: null,
            filtroAgendamento: '',
            servicoModal: null,
            senhaModal: null,
            agendamentosModal: null,
            prioridadeModal: null,
        },
        computed: {
            prioridadeNormal() {
                return this.prioridades.filter(p => p.peso === 0)[0];
            },
            demaisPrioridades() {
                return this.prioridades.filter(p => p.peso > 0);
            },
            servicosHabilitados() {
                return this.servicos.filter(function (su) {
                    return su.habilitado;
                });
            },
            agendamentosFiltrados () {
                return this.agendamentos.filter(agendamento => {
                    if (!this.filtroAgendamento) {
                        return this.agendamentos;
                    }
                    return (
                        agendamento.cliente.nome.toUpperCase().indexOf(this.filtroAgendamento.toUpperCase()) !== -1 ||
                        agendamento.cliente.documento.indexOf(this.filtroAgendamento) !== -1 ||
                        agendamento.hora.indexOf(this.filtroAgendamento) !== -1
                    );
                });
            },
        },
        methods: {
            update() {
                App.ajax({
                    url: App.url('/novosga.triage/ajax_update'),
                    data: {
                        ids: this.servicoIds.join(','),
                    },
                    success: (response) => {
                        if (response.data) {
                            this.totais = response.data.servicos;
                            this.ultimaSenha = response.data.ultima;
                        }
                    }
                });
            },
            print(atendimento) {
                if (this.config.imprimir) {
                    Impressao.imprimir(atendimento);
                }
            },
            reprint(atendimento) {
                Impressao.imprimir(atendimento);
            },
            showServicoInfo(servico) {
                App.ajax({
                    url: App.url('/novosga.triage/servico_info'),
                    data: {
                        id: servico,
                    },
                    success: (response) => {
                        this.servicoInfo = response.data;
                        this.servicoModal.show();
                    }
                });
            },
            showPrioridades(servicoId) {
                if (this.demaisPrioridades.length === 1) {
                    // se so tiver uma prioridade, emite a senha direto
                    this.distribuiSenha(servicoId, this.demaisPrioridades[0].id);
                } else {
                    this.servico = servicoId;
                    this.prioridadeModal.show();
                }
            },
            loadAgendamentos() {
                this.agendamentos = [];
                if (!this.servicoAgendamento) {
                    return;
                }
                App.ajax({
                    url: App.url(`/novosga.triage/agendamentos/${this.servicoAgendamento}`),
                    success: (response) => {
                        this.agendamentos = response.data;
                    }
                });
            },
            agendamentoConfirm(agendamento) {
                App.ajax({
                    url: App.url(`/novosga.triage/distribui_agendamento/${agendamento.id}`),
                    type: 'post',
                    success: (response) => {
                        this.atendimento = response.data;
                        this.print(this.atendimento);
                        if (this.config.exibir) {
                            this.senhaModal.show();
                        }
                    },
                    complete: () => {
                        this.pausado = false;
                        this.servicoAgendamento = null;
                        this.loadAgendamentos();
                        this.agendamentosModal.hide();
                        this.update();
                    }
                });
            },
            showTicket(ticket) {
                this.atendimento = ticket;
                this.senhaModal.show();
            },
            distribuiSenhaNormal(servico) {
                if (!this.prioridadeNormal) {
                    return;
                }
                this.distribuiSenha(servico, this.prioridadeNormal.id);
            },
            distribuiSenhaPrioritaria() {
                if (!this.prioridade || !this.servico) {
                    return;
                }
                this.distribuiSenha(this.servico, this.prioridade.id);
                this.prioridadeModal.hide();
            },
            distribuiSenha(servico, prioridade) {
                return new Promise((resolve, reject) => {
                    if (this.pausado) {
                        return reject();
                    }
                    // evitando de gerar várias senhas com múltiplos cliques
                    this.pausado = true;

                    const data = {
                        servico: servico,
                        prioridade: prioridade,
                        cliente: null,
                    };
                    if (this.cliente.nome && this.cliente.documento) {
                        data.cliente = {
                            nome: this.cliente.nome,
                            documento: this.cliente.documento,
                        };
                    }

                    App.ajax({
                        url: App.url('/novosga.triage/distribui_senha'),
                        type: 'post',
                        data: data,
                        success: (response) => {
                            this.atendimento = response.data;
                            this.print(this.atendimento);

                            if (this.config.exibir) {
                                this.senhaModal.show();
                            }
                            
                            resolve(this.atendimento);
                            this.cliente = {};
                            
                            this.update();
                        },
                        error() {
                            reject();
                        },
                        complete: () => {
                            this.pausado = false;
                        }
                    });
                });
            },
            consultar() {
                App.ajax({
                    url: App.url('/novosga.triage/consulta_senha'),
                    data: {
                        numero: this.search
                    },
                    success: (response) => {
                        this.searchResult = response.data;
                    }
                });
            },
            saveConfig() {
                this.config.desabilitados = [];
                this.servicos.forEach((su) => {
                    if (!su.habilitado) {
                        this.config.desabilitados.push(su.servico.id);
                    }
                });
                
                App.Storage.set('novosga.triage', JSON.stringify(this.config));
            },
            loadConfig() {
                try {
                    const json = App.Storage.get('novosga.triage');
                    const config = (JSON.parse(json) || {});

                    if (config.exibir === undefined) {
                        config.exibir = true;
                    }

                    if (config.desabilitados === undefined) {
                        config.desabilitados = [];
                    }

                    if (config.imprimir === undefined) {
                        config.imprimir = true;
                    }

                    this.config.imprimir = config.imprimir;
                    this.config.exibir = config.exibir;
                    this.config.desabilitados = config.desabilitados;
                } catch (e) {
                    // do nothing
                }

                this.servicos.forEach((su) => {
                    const habilitado = this.config.desabilitados.indexOf(su.servico.id) === -1;
                    Vue.set(su, 'habilitado', habilitado);
                });
            },
            fetchClients: _.debounce(function () {
                this.fetchingClientes = true;
                App.ajax({
                    url: App.url('/novosga.triage/clientes'),
                    data: {
                        q: this.cliente.documento
                    },
                    success: (response) => {
                        this.fetchingClientes = false;
                        this.clientes = response.data;
                        this.changeClient();
                    },
                    error: () => {
                        this.fetchingClientes = false;
                    }
                })
            }, 400),
            changeDocumento() {
                this.cliente.documento = this.cliente.documento.toUpperCase();
                this.fetchClients();
            },
            changeClient() {
                const isDisabled = this.cliente.id;
                this.cliente.id = null;
                const existingCliente = this.clientes.find((c) => c.documento === this.cliente.documento)
                if (existingCliente) {
                    this.cliente.id = existingCliente.id;
                    this.cliente.nome = existingCliente.nome;
                    this.cliente.documento = existingCliente.documento;
                } else if (isDisabled) {
                    this.cliente.nome = '';
                }
            }
        },
        mounted() { 
            this.servicoModal = new bootstrap.Modal(this.$refs.servicoModal);
            this.senhaModal = new bootstrap.Modal(this.$refs.senhaModal);
            this.agendamentosModal = new bootstrap.Modal(this.$refs.agendamentosModal);
            this.prioridadeModal = new bootstrap.Modal(this.$refs.prioridadeModal);

            this.$refs.agendamentosModal.addEventListener('show.bs.modal', () => {
                this.loadAgendamentos();
            })

            App.SSE.connect([
                `/unidades/${this.unidade.id}/fila`
            ]);

            App.SSE.onmessage = (e, data) => {
                this.update();
            };

            // ajax polling fallback
            App.SSE.ondisconnect = () => {
                this.update();
            };

            this.servicos.forEach((su) => {
                this.servicoIds.push(su.servico.id);
            });

            this.loadConfig();
            this.update();
        }
    });
})();
