<?php

declare(strict_types=1);

/*
 * This file is part of the Novo SGA project.
 *
 * (c) Rogerio Lino <rogeriolino@gmail.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Novosga\TriageBundle\Controller;

use DateTime;
use Exception;
use Novosga\Entity\UsuarioInterface;
use Novosga\Http\Envelope;
use Novosga\Repository\AgendamentoRepositoryInterface;
use Novosga\Repository\AtendimentoRepositoryInterface;
use Novosga\Repository\ClienteRepositoryInterface;
use Novosga\Repository\PrioridadeRepositoryInterface;
use Novosga\Repository\ServicoRepositoryInterface;
use Novosga\Service\AgendamentoServiceInterface;
use Novosga\Service\AtendimentoServiceInterface;
use Novosga\Service\ClienteServiceInterface;
use Novosga\Service\ServicoServiceInterface;
use Novosga\Service\TicketServiceInterface;
use Novosga\TriageBundle\Dto\NovaSenhaDto;
use Novosga\TriageBundle\NovosgaTriageBundle;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * DefaultController
 *
 * @author Rogerio Lino <rogeriolino@gmail.com>
 */
#[Route("/", name: "novosga_triage_")]
class DefaultController extends AbstractController
{
    private const MAX_SCHEDULING_MINUTES_DELAY = 60;

    #[Route("/", name: "index", methods: ['GET'])]
    public function index(
        ServicoServiceInterface $servicoService,
        PrioridadeRepositoryInterface $prioridadeRepository,
    ): Response {
        /** @var UsuarioInterface */
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();

        $prioridades = $prioridadeRepository->findAtivas();
        $servicos = $servicoService->servicosUnidade($unidade, ['ativo' => true]);

        return $this->render('@NovosgaTriage/default/index.html.twig', [
            'usuario' => $usuario,
            'unidade' => $unidade,
            'servicos' => $servicos,
            'prioridades' => $prioridades,
        ]);
    }

    #[Route("/imprimir/{id}", name: "print", methods: ["GET"])]
    public function imprimir(
        TicketServiceInterface $ticketService,
        AtendimentoServiceInterface $atendimentoService,
        int $id,
    ): Response {
        $atendimento = $atendimentoService->getById($id);
        if (!$atendimento) {
            throw $this->createNotFoundException();
        }
        $html = $ticketService->printTicket($atendimento);

        return new Response($html);
    }

    #[Route("/ajax_update", name: "ajax_update", methods: ["GET"])]
    public function ajaxUpdate(
        Request $request,
        AtendimentoRepositoryInterface $atendimentoRepository,
    ): Response {
        $envelope = new Envelope();
        /** @var UsuarioInterface */
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
    
        if ($unidade) {
            $ids = array_filter(explode(',', $request->get('ids')), function ($i) {
                return $i > 0;
            });
            
            $senhas = [];
            if (count($ids)) {
                // total senhas do servico (qualquer status)
                $rs = $atendimentoRepository->countByServicos($unidade, $ids);
                foreach ($rs as $r) {
                    $senhas[$r['id']] = ['total' => $r['total'], 'fila' => 0];
                }
                
                // total senhas esperando
                $rs = $atendimentoRepository
                    ->countByServicos(
                        $unidade,
                        $ids,
                        AtendimentoServiceInterface::SENHA_EMITIDA,
                    );
                foreach ($rs as $r) {
                    $senhas[$r['id']]['fila'] = $r['total'];
                }
                
                // ultima senha
                $ultimoAtendimento = $atendimentoRepository->getUltimo($unidade);

                $data = [
                    'ultima' => $ultimoAtendimento,
                    'servicos' => $senhas,
                ];
                
                $envelope->setData($data);
            }
        }

        return $this->json($envelope);
    }

    #[Route("/servico_info", name: "servico_info", methods: ["GET"])]
    public function servicoInfo(
        Request $request,
        AtendimentoRepositoryInterface $atendimentoRepository,
        ServicoRepositoryInterface $servicoRepository,
        TranslatorInterface $translator,
    ): Response {
        $id = (int) $request->get('id');
        /** @var UsuarioInterface */
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        $servico = $servicoRepository->find($id);
        $envelope = new Envelope();
        
        if (!$servico) {
            throw new Exception($translator->trans('error.invalid_service', [], NovosgaTriageBundle::getDomain()));
        }
        
        $data = [
            'nome' => $servico->getNome(),
            'descricao' => $servico->getDescricao()
        ];

        // ultima senha
        $atendimento = $atendimentoRepository->getUltimo($unidade, $servico);
        
        if ($atendimento) {
            $data['senha']   = (string) $atendimento->getSenha();
            $data['senhaId'] = $atendimento->getId();
        } else {
            $data['senha'] = '-';
            $data['senhaId'] = '';
        }
        
        // subservicos
        $data['subservicos'] = [];
        $subservicos = $servicoRepository->getSubservicos($servico);

        foreach ($subservicos as $s) {
            $data['subservicos'][] = $s->getNome();
        }

        $envelope->setData($data);

        return $this->json($envelope);
    }

    #[Route("/distribui_senha", name: "distribui_senha", methods: ["POST"])]
    public function distribuiSenha(
        AtendimentoServiceInterface $atendimentoService,
        ClienteServiceInterface $clienteService,
        #[MapRequestPayload] NovaSenhaDto $data,
    ): Response {
        $envelope = new Envelope();
        /** @var UsuarioInterface */
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();

        $cliente = null;
        if ($data->cliente !== null) {
            $cliente = $clienteService
                ->build()
                ->setNome($data->cliente->nome ?? '')
                ->setDocumento($data->cliente->documento ?? '');
        }

        $data = $atendimentoService->distribuiSenha(
            $unidade,
            $usuario,
            $data->servico,
            $data->prioridade,
            $cliente
        );
        $envelope->setData($data);

        return $this->json($envelope);
    }

    #[Route("/distribui_agendamento/{id}", name: "distribui_agendamento", methods: ["POST"])]
    public function distribuiSenhaAgendamento(
        AtendimentoServiceInterface $atendimentoService,
        AgendamentoServiceInterface $agendamentoService,
        TranslatorInterface $translator,
        int $id,
    ): Response {
        $agendamento = $agendamentoService->getById($id);
        if (!$agendamento) {
            throw $this->createNotFoundException();
        }
        if ($agendamento->getDataConfirmacao()) {
            throw new Exception($translator->trans('error.schedule.confirmed', [], NovosgaTriageBundle::getDomain()));
        }

        $data = $agendamento->getData()->format('Y-m-d');
        $hora = $agendamento->getHora()->format('H:i');
        $dt = DateTime::createFromFormat('Y-m-d H:i', "{$data} {$hora}");
        $now = new DateTime();

        if ($dt < $now) {
            $diff = $now->diff($dt);
            $mins = $diff->i + ($diff->h * 60);
            if ($mins > self::MAX_SCHEDULING_MINUTES_DELAY) {
                throw new Exception($translator->trans('error.schedule.expired', [], NovosgaTriageBundle::getDomain()));
            }
        }

        $envelope = new Envelope();
        /** @var UsuarioInterface */
        $usuario = $this->getUser();
        $unidade = $agendamento->getUnidade();
        $servico = $agendamento->getServico();
        $prioridade = 1;
        $cliente = $agendamento->getCliente();

        $data = $atendimentoService->distribuiSenha($unidade, $usuario, $servico, $prioridade, $cliente, $agendamento);
        $envelope->setData($data);

        return $this->json($envelope);
    }

    /**
     * Busca os atendimentos a partir do número da senha.
     */
    #[Route("/consulta_senha", name: "consulta_senha", methods: ["GET"])]
    public function consultaSenha(
        Request $request,
        AtendimentoServiceInterface $atendimentoService,
    ): Response {
        $envelope = new Envelope();
        /** @var UsuarioInterface */
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        $numero = $request->get('numero', '');
        $atendimentos = $atendimentoService->buscaAtendimentos($unidade, $numero);
        $envelope->setData($atendimentos);

        return $this->json($envelope);
    }

    /**
     * Busca os clientes a partir do documento.
     */
    #[Route("/clientes", name: "clientes", methods: ["GET"])]
    public function clientes(
        Request $request,
        ClienteRepositoryInterface $clienteRepository,
    ): Response {
        $envelope  = new Envelope();
        $documento = $request->get('q');
        $clientes  = $clienteRepository->findByDocumento("{$documento}%");

        $envelope->setData($clientes);

        return $this->json($envelope);
    }

    #[Route("/agendamentos/{servicoId}", name: "atendamentos", methods: ["GET"])]
    public function agendamentos(
        AgendamentoRepositoryInterface $agendamentoRepository,
        int $servicoId,
    ): Response {
        /** @var UsuarioInterface */
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        $data = new DateTime();

        $agendamentos = $agendamentoRepository->findBy(
            [
                'unidade' => $unidade,
                'servico' => $servicoId,
                'data' => $data,
            ],
            [
                'hora' => 'ASC'
            ]
        );

        return $this->json(new Envelope($agendamentos));
    }
}
