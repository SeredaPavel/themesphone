'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {normalizeCart,readCart,completeCartOrder,completePendingCartOrder,rememberCartOrder,forgetCartOrder} from '@/lib/cart-storage'
import type {CartItem,StoredCart} from '@/lib/cart-storage'
import type {CartPurchase,ShopOrder} from '@/lib/checkout'
import {useAuthContext} from './AuthContext'
export type {CartItem} from '@/lib/cart-storage'

type CartContextType = {
  cartItems: CartItem[]
  isReady: boolean
  checkoutKey: string
  restartCheckout: () => void
  addToCart: (item: CartItem) => void
  removeFromCart: (id: number) => void
  clearCart: () => void
  completeOrder: (order:{id:string;state:string;items:{documentId:string}[]}) => void
  rememberOrder: (id:string) => void
  purchases: Record<string,CartPurchase>
  isCheckingPurchases: boolean
  purchasesError: string
  refreshPurchases: () => void
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart,setCart]=useState<StoredCart>({version:2,items:[],checkoutKey:''})
  const [isReady,setReady]=useState(false)
  const {user,loading:authLoading}=useAuthContext()
  const activeUser=useRef(user?.id);activeUser.current=user?.id
  const [revision,setRevision]=useState(0)
  const [purchaseState,setPurchaseState]=useState<{signature:string;items:CartPurchase[];error:string}>({signature:'',items:[],error:''})
  const refreshPurchases=useCallback(()=>setRevision(value=>value+1),[])
  const documentIds=cart.items.map(item=>item.documentId).filter((id):id is string=>!!id).sort().join(',')
  const signature=[user?.id,documentIds,cart.checkoutKey,revision].join(':')
  const pendingOrders=JSON.stringify((cart.pendingOrders||[]).filter(row=>row.userId===user?.id).map(row=>row.id))

  // Загрузка из localStorage при инициализации
  useEffect(() => {
    let stored:string|null=null
    try{stored=localStorage.getItem('cart')}catch{/* Storage can be disabled in the browser. */}
    setCart(readCart(stored,()=>crypto.randomUUID()))
    setReady(true)
  }, [])

  useEffect(()=>{
    const sync=(event:StorageEvent)=>{if(event.key==='cart')setCart(readCart(event.newValue,()=>crypto.randomUUID()))}
    let timer:ReturnType<typeof setTimeout>
    const refresh=()=>{clearTimeout(timer);timer=setTimeout(refreshPurchases,100)}
    const visible=()=>{if(document.visibilityState==='visible')refresh()}
    const restored=(event:PageTransitionEvent)=>{if(event.persisted)refresh()}
    window.addEventListener('storage',sync);window.addEventListener('focus',refresh)
    window.addEventListener('pageshow',restored);document.addEventListener('visibilitychange',visible)
    return()=>{clearTimeout(timer);window.removeEventListener('storage',sync);window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',restored);document.removeEventListener('visibilitychange',visible)}
  },[refreshPurchases])

  // Сохраняем изменения
  useEffect(() => {
    if(!isReady)return
    try{localStorage.setItem('cart',JSON.stringify(cart))}catch{/* Keep the in-memory cart usable. */}
  }, [cart,isReady])

  const addToCart = (item: CartItem) => {
    if(!isReady)return
    setCart(prev => {
      const items=normalizeCart([...prev.items,item])
      if(items.length===prev.items.length)return prev
      return {...prev,items,checkoutKey:crypto.randomUUID()}
    })
  }

  const removeFromCart = (id: number) => {
    setCart(prev=>({...prev,items:prev.items.filter(item=>item.id!==id),checkoutKey:crypto.randomUUID()}))
  }

  const clearCart = () => setCart(prev=>({...prev,items:[],checkoutKey:crypto.randomUUID()}))
  const restartCheckout = () => setCart(prev=>({...prev,checkoutKey:crypto.randomUUID()}))
  const completeOrder=useCallback((order:{id:string;state:string;items:{documentId:string}[]})=>{
    if(isReady&&['paid','test_paid'].includes(order.state)){
      setCart(prev=>completePendingCartOrder(prev,order,activeUser.current||0,()=>crypto.randomUUID()))
      refreshPurchases()
    }
  },[isReady,refreshPurchases])
  const rememberOrder=useCallback((id:string)=>{
    if(isReady&&user)setCart(prev=>rememberCartOrder(prev,id,user.id))
  },[isReady,user])

  useEffect(()=>{
    if(!isReady||authLoading||!user||!documentIds)return
    const controller=new AbortController(),userId=user.id
    fetch('/api/account/orders?'+new URLSearchParams({items:documentIds,checkoutKey:cart.checkoutKey}),{cache:'no-store',signal:controller.signal})
      .then(async res=>{
        const data=await res.json();if(controller.signal.aborted||activeUser.current!==userId)return
        if(!res.ok||!Array.isArray(data.purchases))throw Error()
        setPurchaseState({signature,items:data.purchases,error:''})
        if(data.checkoutOrder) setCart(prev=>completeCartOrder(prev,data.checkoutOrder,()=>crypto.randomUUID()))
      })
      .catch(()=>{if(!controller.signal.aborted&&activeUser.current===userId)setPurchaseState({signature,items:[],error:'Не удалось проверить ваши покупки. Повторите проверку перед оформлением.'})})
    return()=>controller.abort()
  },[isReady,authLoading,user?.id,documentIds,cart.checkoutKey,signature])

  useEffect(()=>{
    if(!isReady||authLoading||!user)return
    const controller=new AbortController(),userId=user.id,ids:string[]=JSON.parse(pendingOrders)
    // A provider can return to another tab or page. Reconcile persisted checkouts on return.
    void (async()=>{for(const id of ids){
      try{
        const res=await fetch('/api/checkout/'+id+'/payment',{cache:'no-store',signal:controller.signal})
        if(!res.ok)continue
        const data:{order:ShopOrder;payment:unknown}=await res.json()
        if(controller.signal.aborted||activeUser.current!==userId)return
        if(['paid','test_paid'].includes(data.order.state))completeOrder(data.order)
        else if(data.order.state==='cancelled'||(data.order.state==='expired'&&!data.payment))setCart(prev=>forgetCartOrder(prev,id))
      }catch{if(controller.signal.aborted)return}
    }})()
    return()=>controller.abort()
  },[isReady,authLoading,user?.id,pendingOrders,revision,completeOrder])

  const currentPurchases=!!user&&purchaseState.signature===signature
  const purchases=currentPurchases?Object.fromEntries(purchaseState.items.map(item=>[item.documentId,item])):{}
  const isCheckingPurchases=isReady&&cart.items.length>0&&(authLoading||!!user&&!!documentIds&&!currentPurchases)
  const purchasesError=currentPurchases?purchaseState.error:''

  return (
    <CartContext.Provider value={{ cartItems:cart.items,checkoutKey:cart.checkoutKey,isReady,restartCheckout,completeOrder,rememberOrder,purchases,isCheckingPurchases,purchasesError,refreshPurchases,addToCart,removeFromCart,clearCart }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within a CartProvider')
  return context
}
