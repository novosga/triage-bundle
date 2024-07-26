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

use Symfony\Component\Validator\Constraints as Assert;

/**
 * NovaSenhaDto
 *
 * @author Rogerio Lino <rogeriolino@gmail.com>
 */
final readonly class NovaSenhaDto
{
    public function __construct(
        #[Assert\Range(min: 1)]
        public int $servico,
        #[Assert\Range(min: 1)]
        public int $prioridade,
        #[Assert\Valid]
        public ?ClienteDto $cliente,
    ) {
    }
}
