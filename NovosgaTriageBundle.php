<?php

/*
 * This file is part of the Novo SGA project.
 *
 * (c) Rogerio Lino <rogeriolino@gmail.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Novosga\TriageBundle;

use Novosga\Module\BaseModule;

class NovosgaTriageBundle extends BaseModule
{
    public function getIconName()
    {
        return 'print';
    }

    public function getDisplayName()
    {
        return 'Triagem';
    }

    public function getHomeRoute()
    {
        return 'novosga_triage_index';
    }
}
