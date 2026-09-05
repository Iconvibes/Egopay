import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

export function ScreenHeader({ title, subtitle, onBack }: Props) {
  const navigate = useNavigate();
  return (
    <div className="screen-header">
      <button className="icon-btn" onClick={onBack ?? (() => navigate(-1))} aria-label="Go back">
        <ArrowLeft size={20} />
      </button>
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
    </div>
  );
}