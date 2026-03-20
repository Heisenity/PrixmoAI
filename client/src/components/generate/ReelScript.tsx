import type { ReelScript as ReelScriptType } from '../../types';
import { Card } from '../ui/card';

export const ReelScript = ({ script }: { script: ReelScriptType }) => (
  <Card className="script-card">
    <div>
      <p className="section-eyebrow">Hook</p>
      <h4>{script.hook}</h4>
    </div>
    <div>
      <p className="section-eyebrow">Body</p>
      <p>{script.body}</p>
    </div>
    <div>
      <p className="section-eyebrow">Call to action</p>
      <p>{script.cta}</p>
    </div>
  </Card>
);
