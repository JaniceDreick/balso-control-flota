import jwt from 'jsonwebtoken';
export function requireAuth(req,res,next){
  const h=req.headers.authorization||'';
  const token=h.startsWith('Bearer ')?h.slice(7):'';
  if(!token) return res.status(401).json({message:'Inicia sesión para continuar.'});
  try { req.user=jwt.verify(token,process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({message:'Sesión inválida o vencida. Inicia sesión nuevamente.'}); }
}
export function allowRoles(...roles){
  return (req,res,next)=>roles.includes(req.user?.role)
    ? next() : res.status(403).json({message:'No tienes permisos para esta operación.'});
}
