/**
 * Novo SGA - Triage
 * @author Rogerio Lino <rogeriolino@gmail.com>
 */
(function () {
    'use strict'
    
    var Impressao = {
        
        iframe: 'frame-impressao',
        
        url: function (atendimento) {
            return App.url('/novosga.triage/imprimir/') + atendimento.id +'?_' + (new Date()).getTime();
        },
        
        imprimir: function (atendimento) {
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
            servicoAgendamento: null
        },
        computed: {
            servicosHabilitados: function () {
                return this.servicos.filter(function (su) {
                    return su.habilitado;
                });
            }
        },
        methods: {
            update: function () {
                var self = this;
                App.ajax({
                    url: App.url('/novosga.triage/ajax_update'),
                    data: {
                        ids: self.servicoIds.join(',')
                    },
                    success: function (response) {
                        if (response.data) {
                            self.totais = response.data.servicos;
                            self.ultimaSenha = response.data.ultima;
                        }
                    }
                });
            },

            print: function (atendimento) {
                if (this.config.imprimir) {
                    Impressao.imprimir(atendimento);
                }
            },

            reprint: function (atendimento) {
                Impressao.imprimir(atendimento);
            },

            showServicoInfo: function (servico) {
                var self = this;

                App.ajax({
                    url: App.url('/novosga.triage/servico_info'),
                    data: {
                        id: servico
                    },
                    success: function (response) {
                        self.servicoInfo = response.data;
                        $('#dialog-servico').modal('show');
                    }
                });
            },

            showPrioridades: function (servicoId) {
                if (this.prioridades.length === 1) {
                    // se so tiver uma prioridade, emite a senha direto
                    this.distribuiSenha(servicoId, this.prioridades[0].id);
                } else {
                    this.servico = servicoId;
                    $('#dialog-prioridade').modal('show');
                }
            },

            loadAgendamentos: function () {
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
            
            agendamentoConfirm: function (agendamento) {
                var self = this;
                
                App.ajax({
                    url: App.url('/novosga.triage/distribui_agendamento/') + agendamento.id,
                    type: 'post',
                    success: function (response) {
                        self.atendimento = response.data;
                        self.print(self.atendimento);

                        if (self.config.exibir) {
                            $('#dialog-senha').modal('show');
                        }
                    },
                    complete: function () {
                        self.pausado = false;
                        self.servicoAgendamento = null;
                        self.loadAgendamentos();
                        $('#dialog-agendamentos').modal('hide');
                    }
                });
            },

            showTicket: function (ticket) {
                this.atendimento = ticket;
                $('#dialog-senha').modal('show');
            },

            distribuiSenhaNormal: function (servico) {
                this.distribuiSenha(servico, 1);
            },

            distribuiSenhaPrioritaria: function () {
                if (!this.prioridade || !this.servico) {
                    return;
                }

                this.distribuiSenha(this.servico, this.prioridade.id);

                $('#dialog-prioridade').modal('hide');
            },

            distribuiSenha: function (servico, prioridade) {
                var self = this;
                var defer = $.Deferred();

                if (!self.pausado) {
                    // evitando de gerar várias senhas com múltiplos cliques
                    self.pausado = true;

                    var data = {
                        servico: servico,
                        prioridade: prioridade,
                        cliente: self.cliente,
                        unidade: self.unidade.id
                    };

                    App.ajax({
                        url: App.url('/novosga.triage/distribui_senha'),
                        type: 'post',
                        data: data,
                        success: function (response) {
                            self.atendimento = response.data;
                            self.print(self.atendimento);

                            if (self.config.exibir) {
                                $('#dialog-senha').modal('show');
                            }
                            
                            defer.resolve(self.atendimento);
                            self.cliente = {};
                            
                            self.update();
                        },
                        error: function () {
                            defer.reject();
                        },
                        complete: function () {
                            self.pausado = false;
                        }
                    });
                } else {
                    defer.reject();
                }

                return defer.promise();
            },

            consultar: function () {
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
            
            saveConfig: function () {
                this.config.desabilitados = [];

                var self = this;
                this.servicos.forEach(function (su) {
                    if (!su.habilitado) {
                        self.config.desabilitados.push(su.servico.id);
                    }
                });
                
                App.Storage.set('novosga.triage', JSON.stringify(this.config));
            },
            
            loadConfig: function () {
                try {
                    var json = App.Storage.get('novosga.triage'),
                        config = (JSON.parse(json) || {});
                    
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
            
            changeClient: function () {
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
