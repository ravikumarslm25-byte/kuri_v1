import type { Plate as PlateCfg } from '../config/plates'

/** Full-stage background: looping video when available, else the still image. */
export function Plate({ plate, dim = 0, blur = 0 }: { plate: PlateCfg; dim?: number; blur?: number }) {
  const style = { filter: blur ? `blur(${blur}px)` : undefined, transform: blur ? 'scale(1.04)' : undefined }
  return (
    <div className="plate">
      {plate.video ? (
        <video className="plate-media" src={plate.video} poster={plate.image} autoPlay loop muted playsInline style={style} />
      ) : (
        <img className="plate-media" src={plate.image} alt="" draggable={false} style={style} />
      )}
      {dim > 0 && <div className="plate-dim" style={{ opacity: dim }} />}
    </div>
  )
}
