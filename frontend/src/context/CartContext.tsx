'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {normalizeCart,readCart} from '@/lib/cart-storage'
import type {CartItem,StoredCart} from '@/lib/cart-storage'
export type {CartItem} from '@/lib/cart-storage'

type CartContextType = {
  cartItems: CartItem[]
  isReady: boolean
  checkoutKey: string
  restartCheckout: () => void
  addToCart: (item: CartItem) => void
  removeFromCart: (id: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart,setCart]=useState<StoredCart>({version:2,items:[],checkoutKey:''})
  const [isReady,setReady]=useState(false)

  // Загрузка из localStorage при инициализации
  useEffect(() => {
    let stored:string|null=null
    try{stored=localStorage.getItem('cart')}catch{/* Storage can be disabled in the browser. */}
    setCart(readCart(stored,()=>crypto.randomUUID()))
    setReady(true)
  }, [])

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
      return {version:2,items,checkoutKey:crypto.randomUUID()}
    })
  }

  const removeFromCart = (id: number) => {
    setCart(prev=>({...prev,items:prev.items.filter(item=>item.id!==id),checkoutKey:crypto.randomUUID()}))
  }

  const clearCart = () => setCart({version:2,items:[],checkoutKey:crypto.randomUUID()})
  const restartCheckout = () => setCart(prev=>({...prev,checkoutKey:crypto.randomUUID()}))

  return (
    <CartContext.Provider value={{ cartItems:cart.items,checkoutKey:cart.checkoutKey,isReady,restartCheckout,addToCart,removeFromCart,clearCart }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within a CartProvider')
  return context
}
