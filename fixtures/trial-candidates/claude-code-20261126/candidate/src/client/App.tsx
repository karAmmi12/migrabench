import { Router, useNav } from './router';
import { Fiche } from './pages/Fiche';
import { Recherche } from './pages/Recherche';
import { Remise } from './pages/Remise';

function Screens() {
  const { path, search, navId } = useNav();
  const number = new URLSearchParams(search).get('number') ?? '';
  switch (path) {
    case '/fiche.do': return <Fiche key={navId} number={number} />;
    case '/remise.do': return <Remise key={navId} number={number} />;
    case '/rechercher.do': return <Recherche key={navId} query={search} />;
    default: return <Recherche key={navId} query={null} />;
  }
}

export function App() {
  return <Router><Screens /></Router>;
}
