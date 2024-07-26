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
            servicosHabilitados: function () {
                return this.servicos.filter(function (su) {
                    return su.habilitado;
                });
            },
            agendamentosFiltrados: function () {
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
                var self = this;
                App.ajax({
                    url: App.url('/novosga.triage/ajax_update'),
                    data: {
                        ids: self.servicoIds.join(','),
                    },
                    success: function (response) {
                        if (response.data) {
                            self.totais = response.data.servicos;
                            self.ultimaSenha = response.data.ultima;
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
                var self = this;
                App.ajax({
                    url: App.url('/novosga.triage/servico_info'),
                    data: {
                        id: servico
                    },
                    success(response) {
                        self.servicoInfo = response.data;
                        self.servicoModal.show();
                    }
                });
            },
            showPrioridades(servicoId) {
                if (this.prioridades.length === 1) {
                    // se so tiver uma prioridade, emite a senha direto
                    this.distribuiSenha(servicoId, this.prioridades[0].id);
                } else {
                    this.servico = servicoId;
                    this.prioridadeModal.show();
                }
            },
            loadAgendamentos() {
                var self = this;
                self.agendamentos = [];
                
                if (!self.servicoAgendamento) {
                    return;
                }

                App.ajax({
                    url: App.url('/novosga.triage/agendamentos/') + self.servicoAgendamento,
                    success: function (response) {
                        self.agendamentos = response.data;
                    }
                });
            },
            agendamentoConfirm(agendamento) {
                var self = this;
                
                App.ajax({
                    url: App.url('/novosga.triage/distribui_agendamento/') + agendamento.id,
                    type: 'post',
                    success(response) {
                        self.atendimento = response.data;
                        self.print(self.atendimento);

                        if (self.config.exibir) {
                            self.senhaModal.show();
                        }
                    },
                    complete() {
                        self.pausado = false;
                        self.servicoAgendamento = null;
                        self.loadAgendamentos();
                        self.agendamentosModal.hide();
                    }
                });
            },
            showTicket(ticket) {
                this.atendimento = ticket;
                this.senhaModal.show();
            },
            distribuiSenhaNormal(servico) {
                this.distribuiSenha(servico, 1);
            },
            distribuiSenhaPrioritaria() {
                if (!this.prioridade || !this.servico) {
                    return;
                }

                this.distribuiSenha(this.servico, this.prioridade.id);
                this.prioridadeModal.hide();
            },
            distribuiSenha(servico, prioridade) {
                var self = this;
                return new Promise((resolve, reject) => {
                    if (self.pausado) {
                        return reject();
                    }
                    // evitando de gerar várias senhas com múltiplos cliques
                    self.pausado = true;

                    const data = {
                        servico: servico,
                        prioridade: prioridade,
                        cliente: null,
                    };
                    if (self.cliente.nome && self.cliente.documento) {
                        data.cliente = {...self.cliente};
                    }

                    App.ajax({
                        url: App.url('/novosga.triage/distribui_senha'),
                        type: 'post',
                        data: data,
                        success(response) {
                            self.atendimento = response.data;
                            self.print(self.atendimento);

                            if (self.config.exibir) {
                                self.senhaModal.show();
                            }
                            
                            resolve(self.atendimento);
                            self.cliente = {};
                            
                            self.update();
                        },
                        error() {
                            reject();
                        },
                        complete() {
                            self.pausado = false;
                        }
                    });
                });
            },
            consultar() {
                var self = this;

                App.ajax({
                    url: App.url('/novosga.triage/consulta_senha'),
                    data: {
                        numero: self.search
                    },
                    success: function (response) {
                        self.searchResult = response.data;
                    }
                });
            },
            saveConfig() {
                this.config.desabilitados = [];

                var self = this;
                this.servicos.forEach(function (su) {
                    if (!su.habilitado) {
                        self.config.desabilitados.push(su.servico.id);
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

                var self = this;
                this.servicos.forEach(function (su) {
                    var habilitado = self.config.desabilitados.indexOf(su.servico.id) === -1;
                    Vue.set(su, 'habilitado', habilitado);
                });
            },
            fetchClients: _.debounce(function () {
                var self = this;
                App.ajax({
                    url: App.url('/novosga.triage/clientes'),
                    data: {
                        q: self.cliente.documento
                    },
                    success: function (response) {
                        self.clientes = response.data;
                    }
                })
            }, 250),
            changeClient() {
                this.cliente.nome = '';
                for (var i in this.clientes) {
                    var c = this.clientes[i];
                    if (c.documento === this.cliente.documento) {
                        this.cliente.nome = c.nome;
                        break;
                    }
                }
            }
        },
        mounted() { 
            this.servicoModal = new bootstrap.Modal(this.$refs.servicoModal);
            this.senhaModal = new bootstrap.Modal(this.$refs.senhaModal);
            this.agendamentosModal = new bootstrap.Modal(this.$refs.agendamentosModal);
            this.prioridadeModal = new bootstrap.Modal(this.$refs.prioridadeModal);

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
