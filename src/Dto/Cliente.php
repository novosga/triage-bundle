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

namespace Novosga\TriageBundle\Dto;

use DateTime;
use Novosga\Entity\ClienteInterface;
use Novosga\Entity\EnderecoInterface;

final class Cliente implements ClienteInterface
{
    public function __construct(
        private readonly string $nome,
        private readonly string $documento,
    ) {
    }

    public function getId(): ?int
    {
        return 0;
    }

    public function setId(?int $id): static
    {
        return $this;
    }

    public function getNome(): ?string
    {
        return null;
    }

    public function setNome(?string $nome): static
    {
        return $this;
    }

    public function getDocumento(): ?string
    {
        return null;
    }

    public function setDocumento(?string $documento): static
    {
        return $this;
    }

    public function getEmail(): ?string
    {
        return null;
    }

    public function setEmail(?string $email): static
    {
        return $this;
    }

    public function getTelefone(): ?string
    {
        return null;
    }

    public function setTelefone(?string $telefone): static
    {
        return $this;
    }

    public function getDataNascimento(): ?DateTime
    {
        return null;
    }

    public function setDataNascimento(?DateTime $dataNascimento): static
    {
        return $this;
    }

    public function getGenero(): ?string
    {
        return null;
    }

    public function setGenero(?string $genero): static
    {
        return $this;
    }

    public function getEndereco(): ?EnderecoInterface
    {
        return null;
    }

    public function setEndereco(?EnderecoInterface $endereco): static
    {
        return $this;
    }

    public function getObservacao(): ?string
    {
        return null;
    }

    public function setObservacao(?string $observacao): static
    {
        return $this;
    }

    public function jsonSerialize()
    {
        return [
            'nome' => $this->nome,
            'documento' => $this->documento,
        ];
    }
}
