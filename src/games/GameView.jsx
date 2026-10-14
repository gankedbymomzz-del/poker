import Table from '../Table.jsx';
import DealerTable from './DealerTable.jsx';
import TienLenTable from './TienLenTable.jsx';
import MauBinhTable from './MauBinhTable.jsx';

// Chọn đúng bàn chơi theo loại game
export default function GameView(props) {
  const t = props.game.type || 'poker';
  if (t === 'baicao' || t === 'xidach') return <DealerTable {...props} />;
  if (t === 'tienlen') return <TienLenTable {...props} />;
  if (t === 'maubinh') return <MauBinhTable {...props} />;
  return <Table {...props} />;
}
