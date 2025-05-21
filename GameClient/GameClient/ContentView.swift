//
//  ContentView.swift
//  GameClient
//
//  Created by YounSoo Park on 19/05/2025.
//

import SwiftUI
import Foundation  // 혹은 @testable import GameClientModels

struct ContentView: View {
    @StateObject private var network = NetworkManager()
    
    var body: some View {
        ScrollView {
            Text(network.gameText)
                .padding()
        }
        .onAppear {
            network.fetchGameText()
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
