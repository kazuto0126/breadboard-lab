import { useEffect } from 'react';
import { useEditor } from '../store/editorStore';

/** 動畫播完（每條導線 stepMs，再加 0.3 秒淡出）後把佈線工作改成 done。 */
export function useRoutingAnimation(): void {
  const job = useEditor((s) => s.routingJob);
  useEffect(() => {
    if (job.status !== 'animating') return;
    const timer = setTimeout(() => {
      if (useEditor.getState().routingJob === job) useEditor.getState().setRoutingJob({ status: 'done' });
    }, job.wireIds.length * job.stepMs + 300);
    return () => clearTimeout(timer);
  }, [job]);
}
