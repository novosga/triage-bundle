<?php

/*
 * This file is part of the Novo SGA project.
 *
 * (c) Rogerio Lino <rogeriolino@gmail.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Novosga\TriageBundle\Controller;

use App\Service\TicketService;
use DateTime;
use Exception;
use Novosga\Entity\Agendamento;
use Novosga\Entity\Atendimento;
use Novosga\Entity\Cliente;
use Novosga\Entity\Prioridade;
use Novosga\Entity\Servico;
use Novosga\Http\Envelope;
use Novosga\Service\AtendimentoService;
use Novosga\Service\ServicoService;
use Sensio\Bundle\FrameworkExtraBundle\Configuration\Method;
use Sensio\Bundle\FrameworkExtraBundle\Configuration\Route;
use Symfony\Bundle\FrameworkBundle\Controller\Controller;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * DefaultController
 *
 * @author Rogerio Lino <rogeriolino@gmail.com>
 */
class DefaultController extends Controller
{
    
    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/", name="novosga_triage_index")
     */
    public function indexAction(Request $request, ServicoService $servicoService)
    {
        $em = $this->getDoctrine()->getManager();
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        
        $prioridades = $em->getRepository(Prioridade::class)->findAtivas();
        $servicos = $servicoService->servicosUnidade($unidade, ['ativo' => true]);
        
        return $this->render('@NovosgaTriage/default/index.html.twig', [
            'unidade' => $unidade,
            'servicos' => $servicos,
            'prioridades' => $prioridades,
        ]);
    }

    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/imprimir/{id}", name="novosga_triage_print")
     */
    public function imprimirAction(Request $request, TicketService $service, Atendimento $atendimento)
    {
        $html = $service->printTicket($atendimento);

        return new Response($html);
    }

    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/ajax_update", name="novosga_triage_ajax_update")
     */
    public function ajaxUpdateAction(Request $request, AtendimentoService $atendimentoService)
    {
        $em = $this->getDoctrine()->getManager();
        
        $envelope = new Envelope();
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        $repo    = $em->getRepository(Atendimento::class);
        
        if ($unidade) {
            $ids = explode(',', $request->get('ids'));
            $senhas = [];
            if (count($ids)) {
                // total senhas do servico (qualquer status)
                $rs = $repo->countByServicos($unidade, $ids);
                foreach ($rs as $r) {
                    $senhas[$r['id']] = ['total' => $r['total'], 'fila' => 0];
                }
                
                // total senhas esperando
                $rs = $repo->countByServicos($unidade, $ids, AtendimentoService::SENHA_EMITIDA);
                foreach ($rs as $r) {
                    $senhas[$r['id']]['fila'] = $r['total'];
                }
                
                // ultima senha
                $ultimoAtendimento = $repo->getUltimo($unidade);

                $data = [
                    'ultima'   => $ultimoAtendimento,
                    'servicos' => $senhas,
                ];
                
                $envelope->setData($data);
            }
        }

        return $this->json($envelope);
    }

    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/servico_info", name="novosga_triage_servico_info")
     */
    public function servicoInfoAction(Request $request)
    {
        $em       = $this->getDoctrine()->getManager();
        $id       = (int) $request->get('id');
        $usuario  = $this->getUser();
        $unidade  = $usuario->getLotacao()->getUnidade();
        $servico  = $em->find(Servico::class, $id);
        $envelope = new Envelope();
        
        if (!$servico) {
            throw new Exception(_('Serviço inválido'));
        }
        
        $data = [
            'nome' => $servico->getNome(),
            'descricao' => $servico->getDescricao()
        ];

        // ultima senha
        $atendimento = $em->getRepository(Atendimento::class)->getUltimo($unidade, $servico);
        
        if ($atendimento) {
            $data['senha']   = $atendimento->getSenha()->__toString();
            $data['senhaId'] = $atendimento->getId();
        } else {
            $data['senha']   = '-';
            $data['senhaId'] = '';
        }
        
        // subservicos
        $data['subservicos'] = [];
        $subservicos = $em->getRepository(Servico::class)->getSubservicos($servico);

        foreach ($subservicos as $s) {
            $data['subservicos'][] = $s->getNome();
        }

        $envelope->setData($data);

        return $this->json($envelope);
    }

    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/distribui_senha", name="novosga_triage_distribui_senha")
     * @Method("POST")
     */
    public function distribuiSenhaAction(Request $request, AtendimentoService $atendimentoService)
    {
        $json = json_decode($request->getContent());
        
        $envelope = new Envelope();
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        
        $servico    = isset($json->servico) ? (int) $json->servico : 0;
        $prioridade = isset($json->prioridade) ? (int) $json->prioridade : 0;
        
        $cliente = null;
        if (is_object($json->cliente)) {
            $cliente = new Cliente();
            $cliente->setNome($json->cliente->nome ?? '');
            $cliente->setDocumento($json->cliente->documento ?? '');
        }
        
        $data = $atendimentoService->distribuiSenha($unidade, $usuario, $servico, $prioridade, $cliente);
        $envelope->setData($data);

        return $this->json($envelope);
    }

    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/distribui_agendamento/{id}", name="novosga_triage_distribui_agendamento")
     * @Method("POST")
     */
    public function distribuiSenhaAgendamentoAction(
        Request $request,
        AtendimentoService $atendimentoService,
        Agendamento $agendamento
    ) {
        if ($agendamento->getDataConfirmacao()) {
            throw new Exception('Agendamento já confirmado.');
        }
        
        $data = $agendamento->getData()->format('Y-m-d');
        $hora = $agendamento->getHora()->format('H:i');
        $dt   = DateTime::createFromFormat('Y-m-d H:i', "{$data} {$hora}");
        $now  = new DateTime();
        $diff = $now->diff($dt);
        $mins = $diff->i + ($diff->h * 60);
        $max  = 30;
        
        if ($mins > $max) {
            throw new Exception('Agendamento expirado. Tempo máximo de espera de 30 minutos.');
        }
        
        $envelope   = new Envelope();
        $usuario    = $this->getUser();
        $unidade    = $agendamento->getUnidade();
        $servico    = $agendamento->getServico();
        $prioridade = 1;
        $cliente    = $agendamento->getCliente();
        
        $data = $atendimentoService->distribuiSenha($unidade, $usuario, $servico, $prioridade, $cliente, $agendamento);
        $envelope->setData($data);

        return $this->json($envelope);
    }

    /**
     * Busca os atendimentos a partir do número da senha.
     *
     * @param Request $request
     * @return Response
     *
     * @Route("/consulta_senha", name="novosga_triage_consulta_senha")
     */
    public function consultaSenhaAction(Request $request, AtendimentoService $atendimentoService)
    {
        $envelope = new Envelope();
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        
        if (!$unidade) {
            throw new Exception(_('Nenhuma unidade selecionada'));
        }

        $numero = $request->get('numero');
        $atendimentos = $atendimentoService->buscaAtendimentos($unidade, $numero);
        $envelope->setData($atendimentos);

        return $this->json($envelope);
    }

    /**
     * Busca os clientes a partir do documento.
     *
     * @param Request $request
     * @return Response
     *
     * @Route("/clientes", name="novosga_triage_clientes")
     */
    public function clientesAction(Request $request)
    {
        $envelope  = new Envelope();
        $documento = $request->get('q');
        $clientes  = $this
                ->getDoctrine()
                ->getManager()
                ->getRepository(Cliente::class)
                ->findByDocumento("{$documento}%");
        
        $envelope->setData($clientes);

        return $this->json($envelope);
    }

    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/agendamentos/{id}", name="novosga_triage_atendamentos")
     */
    public function agendamentosAction(Request $request, Servico $servico)
    {
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        $data    = new DateTime();
        
        $agendamentos = $this
            ->getDoctrine()
            ->getRepository(Agendamento::class)
            ->findBy(
                [
                    'unidade' => $unidade,
                    'servico' => $servico,
                    'data'    => $data,
                ],
                [
                    'hora' => 'ASC'
                ]
            );
        
        $envelope = new Envelope();
        $envelope->setData($agendamentos);

        return $this->json($envelope);
    }
}
