import { StrictMode, startTransition, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './style.module.css';

        const div = document.createElement('div');
        document.body.appendChild(div);
        createRoot(div).render(<div></div>);

interface AtkRoll {
    miss: number,
    hits: number,
    crits: number,
    surges: number
}

interface DefRoll {
    miss: number,
    blocks: number,
    surges: number
}

enum AtkSurge {None, Hit, Crit}

interface RollConfig {
    redAtk: number,
    blackAtk: number,
    whiteAtk: number,
    atkSurge: AtkSurge,
    critical: number,
    atkSurges: number,
    sharpShooter: 0 | 1 |2,
    blast: boolean,
    highVelocity: boolean,
    ram: number,
    impact: number,

    cover: 0 | 1| 2,
    lowProfile: boolean,
    shields: number,
    dodges: number,
    armor: 0| 1|2|3|4|5,
    defDice: boolean,
    defSurge: boolean
}

const SingleRoll : (r : RollConfig) => number = (r) =>  {
    const redRoll = E(r.redAtk, AtkDice.Red);
    const blackRoll = E(r.blackAtk, AtkDice.Black);
    const whiteRoll = E(r.whiteAtk, AtkDice.White);
    //losse dice types zijn belangrijk voor aims, verder niet

    const totalAtkRoll : AtkRoll = {
        crits: redRoll.crits + blackRoll.crits + whiteRoll.crits,
        hits: redRoll.hits + blackRoll.hits + whiteRoll.hits,
        miss: redRoll.miss + blackRoll.miss + whiteRoll.miss,
        surges: redRoll.surges + blackRoll.surges + whiteRoll.surges,
    };
    const afterCritical = criticalFilter(r, totalAtkRoll);
    const afterSurgeToken = surgeTokenAtkFilter(r, afterCritical);
    const afterSurge = surgeConversionAtk(r, afterSurgeToken);

    const rollDefDice = defDice(afterSurge.crits + afterSurge.hits, r.defDice);
    const afterDefSurge = surgeConversionDef(r, rollDefDice);

    return afterSurge.crits + afterSurge.hits - afterDefSurge.blocks;
};

const coverFilter: AttackFilter = (r,a ) => {
    //determine the cover
    if (r.blast) {
        return a;
    }
    const c = r.cover - r.sharpShooter;
    if (c <= 0) {
        return a;
    }
    if (a.hits === 0) {
        return a;
    }
    const toRoll = (a.hits) - (r.lowProfile ? 1 : 0);
    const roll = defDice(toRoll, false);
    if (c === 1) {
        return {...a, hits: a.hits - roll.blocks};
    }
    return {...a, hits: a.hits - roll.blocks - roll.surges};
};

const shieldFilter: AttackFilter = (r,a) => {
    const copy = {...a};
    let remainingShields = r.shields;
    if (remainingShields >= a.crits) {
        remainingShields -= copy.crits;
        copy.crits = 0;
        if (remainingShields >= copy.hits) {
            copy.hits = 0;
        } else {
            copy.hits -= remainingShields;
        }
    } else {
        copy.crits = 0;
    }
    return copy;
}

const dodgeFilter: AttackFilter = (r,a) => {
    if (r.highVelocity) {
        return a;
    }
    if (r.dodges >= a.hits) {
        return {...a, hits: 0};
    } else {
        return {...a, hits: a.hits - r.dodges};
    }
}

const ramFilter: AttackFilter = (r,a) => {
    let ramRemaining = r.ram;
    const copy = {...a};
    if (copy.miss >= ramRemaining) {
        copy.crits += ramRemaining;
        copy.miss -= ramRemaining;
    } else {
        copy.crits += copy.miss;
        ramRemaining -= copy.miss;
        copy.miss = 0;
        if (copy.surges >= ramRemaining) {
            copy.crits += ramRemaining;
            copy.surges -= ramRemaining;
        } else {
            copy.crits += ramRemaining;
            ramRemaining -= copy.surges;
            copy.surges = 0;
            if (copy.hits >= ramRemaining) {
                copy.crits += ramRemaining;
                copy.hits -= ramRemaining;
            } else {
                copy.crits += copy.hits;
                copy.hits = 0;
            }
        }
    }
    return copy;
}

const impactFilter: AttackFilter = (r,a) => {
    if (r.armor === 0) {
        return a;
    }
    if (a.hits >= r.impact) {
        return {...a, crits: a.crits + r.impact, hits: a.hits - r.impact};
    }
    return {...a, crits: a.crits + a.hits, hits: 0};
};

const armorFilter: AttackFilter = (r,a) => {
    if (r.armor === 0) {
        return a;
    }
    if (a.hits <= r.armor) {
        return {...a, hits: 0};
    }
    return {...a, hits: a.hits - r.armor};
};

type AttackFilter = (r: RollConfig, a: AtkRoll) => AtkRoll;

const criticalFilter: AttackFilter = (r, a) => {
    if (r.critical === 0 || a.surges === 0) {
        return a;
    }
    const copy = {...a};
    if (r.critical >= a.surges) {
        copy.crits += a.surges;
        copy.surges = 0;
    } else {
        copy.crits += r.critical;
        copy.surges -= r.critical;
    }
    return copy;
}

const surgeTokenAtkFilter: AttackFilter = (r, a) => {
    if (r.atkSurges === 0 || a.surges === 0) {
        return a;
    }
    const copy = {...a};
    if (r.atkSurges >= a.surges) {
        copy.hits += a.surges;
        copy.surges = 0;
    } else {
        copy.hits += r.atkSurges;
        copy.surges -= r.atkSurges;
    }
    return copy;
}

const surgeConversionAtk: AttackFilter = (r, a) => {
    const copy = {...a};
    switch (r.atkSurge) {
        case AtkSurge.None:
            copy.miss += copy.surges;
            copy.surges = 0;
            break;
        case AtkSurge.Hit:
            copy.hits += copy.surges;
            copy.surges = 0;
            break;
        case AtkSurge.Crit:
            copy.crits += copy.surges;
            copy.surges = 0;
            break;
    }
    return copy;
}

const surgeConversionDef = (r: RollConfig, a: DefRoll) => {
    const copy = {...a};
    if (r.defSurge) {
        copy.blocks += copy.surges;
        copy.surges = 0;
    }
    return copy;
}

enum AtkDice { Red, Black, White};

const E = (i: number, tp: AtkDice) => {
    const result: AtkRoll = {
        crits: 0,
        hits: 0,
        miss: 0,
        surges: 0
    }
    let hitCount = 0;
    switch (tp) {
        case AtkDice.Red:
            hitCount = 5;
            break;
        case AtkDice.Black:
            hitCount = 3;
            break;
        case AtkDice.White:
            hitCount = 1;
            break;
    }
    for (const x =0 ; x < i ; i++) {
        const r = R(8);
        if (r < hitCount){
            result.hits++;
        } else if (r < hitCount + 1) {
            result.crits++;
        } else if (r < hitCount + 2) {
            result.surges++;
        } else {
            result.miss++;
        }
    }
    return result;
}

const defDice = (i: number, tp: boolean) => {
    const result: DefRoll = {
        blocks: 0,
        miss: 0,
        surges: 0
    }
    const hitCount =  tp ? 3 : 1;
    for (const x =0 ; x < i ; i++) {
        const r = R(6);
        if (r < hitCount){
            result.blocks++;
        } else if (r < hitCount + 1) {
            result.surges++;
        } else {
            result.miss++;
        }
    }
    return result;
}

const R : (limit: number) => number = (l) =>  {
    const n = Math.floor(Math.random() * l);
    return n;
};
